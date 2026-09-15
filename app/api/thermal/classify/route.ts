// ============================================================
// app/api/thermal/classify/route.ts
// 별지7 열화상: 실화상(Y) 축소본을 Claude에 보내 촬영 부위(PF/PT/CH)를 분류한다.
//  · 요청: { images: string[] }  (base64 JPEG, 촬영 순서)
//  · 응답: { parts: ('PF'|'PT'|'CH'|null)[] }  (images와 같은 순서)
//  · ANTHROPIC_API_KEY 미설정/실패 시 에러 → 화면에서 직접 지정으로 대체
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGES = 60;

const ResultSchema = z.object({
  labels: z.array(z.object({
    index: z.number().int(),
    part: z.enum(['PF', 'PT', 'CH', 'UNKNOWN']),
  })),
});

const PROMPT = `These are visible-light photos taken during an infrared thermography inspection of a high-voltage (22.9kV) receiving switchgear panel at an EV charging station in Korea. Each photo shows one of three component types:

- PF (power fuse): long cylindrical fuses, usually brown/maroon or beige bodies, often with yellow or white rating labels, mounted horizontally or vertically between clips.
- PT (potential/instrument transformer): black or dark epoxy-resin molded transformer bodies with ribbed insulators and small terminals on top; boxy shape.
- CH (cable head): ends of black high-voltage power cables with white/grey ribbed stress-cone terminations (skirted sheds) connected to busbar lugs, often three in a row.

Photos were shot in order, typically three consecutive shots (one per phase) of the same component type, so neighbouring photos usually share a label — but judge each photo by what it shows. Use UNKNOWN only when the photo clearly shows none of these.

Return one label for every photo index.`;

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI 키(ANTHROPIC_API_KEY)가 서버에 설정되지 않았습니다' }, { status: 503 });
    }

    const { images } = await req.json();
    if (!Array.isArray(images) || !images.length) return NextResponse.json({ error: '사진이 없습니다' }, { status: 400 });
    if (images.length > MAX_IMAGES) return NextResponse.json({ error: `사진은 최대 ${MAX_IMAGES}장까지 분류할 수 있습니다` }, { status: 400 });

    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    images.forEach((b64: string, i: number) => {
      content.push({ type: 'text', text: `Photo index ${i}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: String(b64).replace(/^data:image\/[a-z]+;base64,/, '') } });
    });
    content.push({ type: 'text', text: PROMPT });

    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: zodOutputFormat(ResultSchema) },
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json({ error: 'AI가 분류 결과를 반환하지 않았습니다' }, { status: 502 });
    }

    const parts: ('PF' | 'PT' | 'CH' | null)[] = images.map(() => null);
    for (const { index, part } of response.parsed_output.labels) {
      if (index >= 0 && index < parts.length) parts[index] = part === 'UNKNOWN' ? null : part;
    }
    return NextResponse.json({ parts });
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
