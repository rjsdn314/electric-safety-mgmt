// ============================================================
// app/api/annual/build/route.ts
// 검토된 설비 사양(AnnualSpec) → 충전소 맞춤 연차 양식 생성
//  · GET  ?station_id=  : 이전에 저장한 사양 불러오기(다시 고칠 때)
//  · POST { station_id, spec, save }
//      save=false → 엑셀만 내려받기
//      save=true  → 그 충전소의 연차 양식으로 등록(station_templates '연차') + 사양 JSON 보관
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/supabase/route-user';
import { buildAnnualXlsx } from '@/lib/excel/annualBuild';
import { normalizeXlsx, detectSheetMeta } from '@/lib/excel/normalize';
import { isLowVoltage, type AnnualSpec } from '@/lib/annual/spec';

export const runtime = 'nodejs';
export const maxDuration = 60;

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function authorize(stationId: string) {
  const user = await getRouteUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }) };
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: station } = await sb.from('stations').select('id, name, user_id').eq('id', stationId).single();
  if (!station) return { error: NextResponse.json({ error: '충전소를 찾을 수 없습니다' }, { status: 404 }) };
  const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (prof?.role !== 'admin' && station.user_id !== user.id) {
    return { error: NextResponse.json({ error: '본인 관리구역의 충전소만 사용할 수 있습니다' }, { status: 403 }) };
  }
  return { sb, user, station };
}

export async function GET(req: NextRequest) {
  const stationId = req.nextUrl.searchParams.get('station_id') || '';
  if (!stationId) return NextResponse.json({ error: 'station_id 누락' }, { status: 400 });
  const a = await authorize(stationId);
  if ('error' in a) return a.error;
  const { data } = await a.sb.storage.from('templates').download(`${stationId}/annual_spec.json`);
  if (!data) return NextResponse.json({ spec: null });
  try { return NextResponse.json({ spec: JSON.parse(await data.text()) }); }
  catch { return NextResponse.json({ spec: null }); }
}

export async function POST(req: NextRequest) {
  try {
    const { station_id, spec, save } = (await req.json()) as { station_id: string; spec: AnnualSpec; save?: boolean };
    if (!station_id || !spec) return NextResponse.json({ error: '충전소와 설비 정보가 필요합니다' }, { status: 400 });
    const a = await authorize(station_id);
    if ('error' in a) return a.error;
    const { sb, user, station } = a;

    // 연차 기본틀 (public/templates) — 고압: 내린천휴게소 연차 양식 / 저압(380V 수전): 선산휴게소 연차 양식 기반
    const origin = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL;
    const baseName = isLowVoltage(spec) ? 'annual_base_low.xlsx' : 'annual_base_high.xlsx';
    const baseRes = await fetch(`${origin}/templates/${baseName}`);
    if (!baseRes.ok) throw new Error('연차 기본 양식을 불러오지 못했습니다');
    const base = await baseRes.arrayBuffer();

    const { buffer, warnings } = await buildAnnualXlsx(base, spec);
    const fileName = `${spec.station_label || station.name}_연차양식.xlsx`;

    if (save) {
      const clean = await normalizeXlsx(buffer);
      const meta = await detectSheetMeta(clean);
      const path = `${station_id}/annual.xlsx`;
      const { error: upErr } = await sb.storage.from('templates').upload(path, clean, { contentType: XLSX, upsert: true });
      if (upErr) throw new Error(`양식 저장 실패: ${upErr.message}`);
      await sb.storage.from('templates').upload(`${station_id}/annual_spec.json`,
        Buffer.from(JSON.stringify(spec)), { contentType: 'application/json', upsert: true });
      const { data: urlData } = sb.storage.from('templates').getPublicUrl(path);
      const { error: dbErr } = await sb.from('station_templates').upsert({
        station_id,
        inspection_group: '연차',
        file_path: path,
        public_url: urlData.publicUrl,
        original_name: `도면 자동생성 — ${fileName}`,
        sheet_names: meta.sheet_names,
        byeolji7_count: meta.byeolji7_count,
        has_insulation: meta.has_insulation,
        has_ground: meta.has_ground,
        uploaded_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'station_id,inspection_group' });
      if (dbErr) throw new Error(`양식 등록 실패: ${dbErr.message}`);
      return NextResponse.json({ success: true, saved: true, warnings, fileName, fileBase64: clean.toString('base64') });
    }

    return NextResponse.json({ success: true, saved: false, warnings, fileName, fileBase64: buffer.toString('base64') });
  } catch (e: any) {
    console.error('연차 양식 생성 오류:', e);
    return NextResponse.json({ error: e?.message || '양식 생성 실패' }, { status: 500 });
  }
}
