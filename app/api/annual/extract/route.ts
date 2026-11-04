// ============================================================
// app/api/annual/extract/route.ts
// 도면(PDF) → AI(Claude)가 현장 설비를 읽어 연차 양식 사양(AnnualSpec) 초안을 만든다.
//  · 요청: { station_id, storage_path }  (브라우저가 templates 버킷에 직접 올린 PDF)
//          또는 { station_id, pdf_base64 } (작은 파일 직접 전송)
//  · 응답: { spec, notes }  → 화면에서 사용자가 검토·수정 후 /api/annual/build 로 생성
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getRouteUser } from '@/lib/supabase/route-user';
import {
  AnnualSpec, emptySpec, newTransformer, breakerDefaults, defaultHvCircuits,
} from '@/lib/annual/spec';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_PDF_BYTES = 25 * 1024 * 1024;

const Extract = z.object({
  supply_voltage_v: z.number().nullable().describe('수전전압(V). 예: 22900'),
  capacity_kw: z.number().nullable().describe('수전 설비용량(kW). 변압기 용량 합계(kVA)를 그대로 써도 됨'),
  overhead_line: z.boolean().nullable().describe('인입이 가공전선로면 true, 지중(케이블)이면 false'),
  transformers: z.array(z.object({
    kva: z.number(),
    primary_kv: z.number().nullable(),
    secondary_v: z.number().nullable(),
    phase: z.number().nullable().describe('3 또는 1'),
  })),
  hv: z.object({
    lightning_arrester: z.boolean().describe('피뢰기(LA)'),
    power_fuse: z.boolean().describe('전력퓨즈(PF)/COS'),
    instrument_transformer: z.boolean().describe('MOF/PT/CT 등 변성기'),
    relay: z.boolean().describe('보호계전기(OCR/OCGR/UVR 등)'),
    breaker: z.boolean().describe('VCB/ACB/LBS 등 차단기류'),
    power_capacitor: z.boolean().describe('전력용(고압) 커패시터 SC'),
  }),
  low: z.object({
    motor: z.boolean(), welder: z.boolean(), capacitor: z.boolean(),
    generator: z.boolean(), battery: z.boolean().describe('ESS/축전지'),
    premises_line: z.boolean().describe('구내 가공전선로'),
  }),
  hv_circuits: z.array(z.string()).describe('고압 절연측정 구간 이름. 예: 책임2차~ASS1차, ASS2차~TR1차'),
  panels: z.array(z.object({
    name: z.string().describe('분전반/배전반 이름: SS-1, 통신함-1, 분전함-1 등 도면 표기'),
    breakers: z.array(z.object({
      type: z.string().describe('MCCB, ELB, ACB 등'),
      poles: z.number().describe('극수 2/3/4'),
      amps: z.number().describe('정격전류(AT) A'),
      quantity: z.number().describe('같은 사양의 개수'),
      spd: z.boolean().describe('이 차단기 2차에 SPD(서지보호기)가 연결되면 true'),
    })),
  })),
  chargers: z.array(z.object({ kw: z.number(), count: z.number(), model: z.string() })),
  charger_maker: z.string().nullable(),
  notes: z.array(z.string()).describe('확실하지 않거나 사용자가 확인해야 할 점(한국어)'),
});

const PROMPT = `첨부한 PDF는 한국 전기차 충전소의 전기설비 도면(단선결선도·분전반 결선도·배치도 등)입니다.
전기안전관리자가 연차점검 기록표 양식을 만들 수 있도록, 도면에서 다음 설비를 빠짐없이 읽어 주세요.

1. 수전: 수전전압(V, 예 22900), 수전 설비용량(kW 또는 변압기 kVA 합계), 인입 방식(가공/지중).
2. 변압기: 대수와 각 용량(kVA), 1차/2차 전압, 상수.
3. 특고압/고압 설비 유무: 피뢰기, 전력퓨즈(PF/COS), MOF·PT·CT(변성기), 보호계전기, VCB·LBS·ACB 등 차단기류, 전력용 커패시터.
4. 저압 설비 유무: 전동기, 용접기, 저압 커패시터, 발전기, ESS/축전지, 구내 가공전선로.
5. 고압 절연측정 구간 이름(예: 책임2차~ASS1차, ASS2차~TR1차). 도면에 ASS가 있으면 이 두 구간을 그대로 쓰세요.
6. 저압 분전반/배전반(SS-1, SS-2, 통신함-1 등)별 분기 차단기 목록: 종류(MCCB/ELB/ACB), 극수, 정격전류(A), 개수, SPD 연결 여부.
   메인 차단기와 분기 차단기를 모두 포함하고, 도면 순서대로 나열하세요. 같은 사양은 quantity로 묶어도 됩니다.
7. 충전기: 용량(kW)별 대수와 모델명(예 200kW CS20A3, 350kW AD35A0), 제조사.

도면에서 읽을 수 없는 값은 추측하지 말고 null(또는 빈 목록)로 두고, notes에 무엇을 확인해야 하는지 한국어로 적어 주세요.`;

export async function POST(req: NextRequest) {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI 키(ANTHROPIC_API_KEY)가 서버에 설정되지 않았습니다' }, { status: 503 });
    }
    const { station_id, storage_path, pdf_base64, breaker_prefix = '2' } = await req.json();
    if (!station_id) return NextResponse.json({ error: '충전소를 선택하세요' }, { status: 400 });

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: station } = await sb.from('stations').select('id, name, voltage, capacity, user_id').eq('id', station_id).single();
    if (!station) return NextResponse.json({ error: '충전소를 찾을 수 없습니다' }, { status: 404 });
    const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
    if (prof?.role !== 'admin' && station.user_id !== user.id) {
      return NextResponse.json({ error: '본인 관리구역의 충전소만 사용할 수 있습니다' }, { status: 403 });
    }

    // PDF 확보
    let b64: string;
    if (storage_path) {
      if (!String(storage_path).startsWith(`${station_id}/`)) return NextResponse.json({ error: '잘못된 파일 경로' }, { status: 400 });
      const { data: dl, error } = await sb.storage.from('templates').download(storage_path);
      if (error || !dl) throw new Error(`도면 파일을 찾을 수 없습니다: ${error?.message || ''}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      if (buf.length > MAX_PDF_BYTES) return NextResponse.json({ error: '도면 PDF는 25MB 이하로 올려 주세요' }, { status: 400 });
      b64 = buf.toString('base64');
    } else if (pdf_base64) {
      b64 = String(pdf_base64).replace(/^data:application\/pdf;base64,/, '');
    } else {
      return NextResponse.json({ error: '도면 PDF가 없습니다' }, { status: 400 });
    }

    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: zodOutputFormat(Extract) },
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
    const x = response.parsed_output;
    if (response.stop_reason === 'refusal' || !x) {
      return NextResponse.json({ error: 'AI가 도면 분석 결과를 반환하지 않았습니다' }, { status: 502 });
    }

    // ── AI 결과 → 양식 사양 ──
    const sp: AnnualSpec = emptySpec();
    sp.station_label = station.name;
    sp.supply_voltage = x.supply_voltage_v || Number(station.voltage) || 22900;
    const trKva = x.transformers.reduce((s, t) => s + (t.kva || 0), 0);
    sp.capacity_kw = x.capacity_kw || Number(station.capacity) || trKva;
    sp.transformers = x.transformers.filter((t) => t.kva > 0).map((t) => {
      const tr = newTransformer(t.kva);
      if (t.phase === 1) tr.phase = '1￠';
      if (t.primary_kv || t.secondary_v) tr.volt = `${t.primary_kv ?? 22.9}/${t.secondary_v ?? 380}`;
      return tr;
    });

    const mh = sp.marks_high, ml = sp.marks_low;
    const on = (b: boolean | null | undefined) => (b ? '○' : '/') as '○' | '/';
    if (x.overhead_line !== null) { mh['가공전선로'] = on(x.overhead_line); mh['지중전선로'] = on(!x.overhead_line); }
    mh['피뢰기'] = on(x.hv.lightning_arrester);
    mh['전력퓨즈'] = on(x.hv.power_fuse);
    mh['변성기'] = on(x.hv.instrument_transformer);
    mh['계전기류'] = on(x.hv.relay);
    mh['차단기류'] = on(x.hv.breaker);
    mh['전력용커패시터'] = on(x.hv.power_capacitor);
    mh['변압기'] = on(sp.transformers.length > 0);
    ml['전동기'] = on(x.low.motor); ml['용접기'] = on(x.low.welder); ml['커패시터'] = on(x.low.capacitor);
    ml['발전기'] = on(x.low.generator); ml['축전장치'] = on(x.low.battery); ml['구내전선로'] = on(x.low.premises_line);

    if (x.hv_circuits.length) {
      const known = new Map(defaultHvCircuits().map((c) => [c.name.replace(/\s/g, ''), c]));
      sp.hv_circuits = x.hv_circuits.map((n) => known.get(n.replace(/\s/g, '')) || {
        name: n, insul: '2000', ab: '0', bc: '0', ca: '0', result: '적 합', remark: '',
      });
    }

    sp.panels = x.panels.map((p) => ({
      name: p.name,
      voltage: '380/220',
      ground: true,
      breakers: p.breakers.flatMap((b) => {
        const type = (b.type || 'MCCB').toUpperCase().replace(/\s/g, '');
        const spec = `${breaker_prefix}${type}${b.poles || 4}P${b.amps}A`;
        const d = breakerDefaults(spec);
        const n = Math.max(1, Math.min(50, Math.round(b.quantity || 1)));
        return Array.from({ length: n }, () => ({ spec, voltage: d.voltage, value: d.value, remark: b.spd ? 'SPD' : '' }));
      }),
    }));

    sp.chargers = x.chargers.filter((c) => c.kw > 0).map((c) => ({ kw: c.kw, count: Math.max(1, Math.round(c.count)), model: c.model || '' }));
    if (x.charger_maker) sp.charger_maker = x.charger_maker;
    sp.notes = x.notes;

    return NextResponse.json({ spec: sp });
  } catch (e: any) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: 'AI 키가 올바르지 않습니다' }, { status: 503 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'AI 사용량 한도 초과 — 잠시 후 다시 시도하세요' }, { status: 429 });
    console.error('도면 분석 오류:', e);
    return NextResponse.json({ error: e?.message || '도면 분석 실패' }, { status: 500 });
  }
}
