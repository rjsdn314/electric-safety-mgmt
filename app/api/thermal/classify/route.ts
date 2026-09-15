// ============================================================
// app/api/thermal/classify/route.ts
// 별지7 열화상: 실화상(Y) 축소본을 Claude에 보내 촬영 부위를 분류한다.
//  · 부위 목록 = 로그인 계정의 설정(없으면 PF/PT/CH 기본값)
//  · 참고 예시 = 그 계정이 전에 확정·수정한 분류 사진(부위별 최근 3장)
//  · 요청: { images: string[] }  (base64 JPEG, 촬영 순서)
//  · 응답: { parts: (string|null)[] }  (images와 같은 순서, 부위 이름)
//  · ANTHROPIC_API_KEY 미설정/실패 시 에러 → 화면에서 직접 지정으로 대체
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createClient } from '@/lib/supabase/server';
import { getRouteUser } from '@/lib/supabase/route-user';
import { DEFAULT_PARTS, sanitizeParts } from '@/lib/thermal/parts';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGES = 60;
const EXAMPLES_PER_PART = 3;

export async function POST(req: NextRequest) {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI 키(ANTHROPIC_API_KEY)가 서버에 설정되지 않았습니다' }, { status: 503 });
    }

    const { images } = await req.json();
    if (!Array.isArray(images) || !images.length) return NextResponse.json({ error: '사진이 없습니다' }, { status: 400 });
    if (images.length > MAX_IMAGES) return NextResponse.json({ error: `사진은 최대 ${MAX_IMAGES}장까지 분류할 수 있습니다` }, { status: 400 });

    // 계정별 부위 목록 + 과거 확정 예시
    const sb = createClient();
    const [{ data: prof }, { data: exRows }] = await Promise.all([
      sb.from('thermal_part_profiles').select('parts').eq('user_id', user.id).maybeSingle(),
      sb.from('thermal_examples').select('part, image').eq('user_id', user.id).order('created_at', { ascending: false }).limit(80),
    ]);
    const saved = sanitizeParts(prof?.parts);
    const parts = saved.length ? saved : DEFAULT_PARTS;
    const names = parts.map((p) => p.name);
    const examples = names.flatMap((n) => (exRows || []).filter((e) => e.part === n).slice(0, EXAMPLES_PER_PART));

    const ResultSchema = z.object({
      labels: z.array(z.object({
        index: z.number().int(),
        part: z.enum(['UNKNOWN', ...names] as [string, ...string[]]),
      })),
    });

    const stripPrefix = (b64: string) => String(b64).replace(/^data:image\/[a-z]+;base64,/, '');
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (examples.length) {
      content.push({ type: 'text', text: "Reference examples — this inspector's own past photos, already correctly labeled:" });
      for (const ex of examples) {
        content.push({ type: 'text', text: `Example of ${ex.part}:` });
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: stripPrefix(ex.image) } });
      }
      content.push({ type: 'text', text: 'Photos to classify:' });
    }
    images.forEach((b64: string, i: number) => {
      content.push({ type: 'text', text: `Photo index ${i}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: stripPrefix(b64) } });
    });
    content.push({
      type: 'text',
      text: `These are visible-light photos taken during an infrared thermography inspection of electrical receiving equipment (switchgear) at an EV charging station in Korea. This inspector photographs the following component types (descriptions may be in Korean):

${parts.map((p) => `- ${p.name}: ${p.desc || '(no description)'}`).join('\n')}

Different inspectors frame and choose components differently, so when reference examples are given, rely on them to learn how this inspector photographs each component. Photos were shot in order, typically several consecutive shots (one per phase) of the same component, so neighbouring photos usually share a label — but judge each photo by what it shows. Use UNKNOWN only when a photo clearly shows none of these components.

Return one label for every photo index, using exactly the component names listed above.`,
    });

    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: zodOutputFormat(ResultSchema) },
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json({ error: 'AI가 분류 결과를 반환하지 않았습니다' }, { status: 502 });
    }

    const out: (string | null)[] = images.map(() => null);
    for (const { index, part } of response.parsed_output.labels) {
      if (index >= 0 && index < out.length) out[index] = part === 'UNKNOWN' ? null : part;
    }
    return NextResponse.json({ parts: out, part_names: names, examples_used: examples.length });
  } catch (e: any) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'AI 키가 올바르지 않습니다' }, { status: 503 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'AI 사용량 한도 초과 — 잠시 후 다시 시도하세요' }, { status: 429 });
    }
    console.error('열화상 분류 오류:', e);
    return NextResponse.json({ error: e?.message || 'AI 분류 실패' }, { status: 500 });
  }
}
