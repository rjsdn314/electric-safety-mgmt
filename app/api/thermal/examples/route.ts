// ============================================================
// app/api/thermal/examples/route.ts
// 계정별 분류 예시(사용자가 확정·수정한 사진 축소본) — AI 분류 때 참고 자료로 사용
//  GET                    → { examples: [{ id, part, image, created_at }] }
//  POST { examples: [{ part, image }] } → 저장(부위별 최신 PER_PART장만 유지)
//  DELETE ?id=123 | ?part=PF → 삭제
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRouteUser } from '@/lib/supabase/route-user';

export const runtime = 'nodejs';

const PER_PART = 6;          // 부위별 보관 장수
const MAX_POST = 12;         // 한 번에 저장 가능한 장수
const MAX_IMAGE_CHARS = 150_000;

export async function GET() {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const { data, error } = await createClient().from('thermal_examples')
      .select('id, part, image, created_at').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(120);
    if (error) throw new Error(error.message);
    return NextResponse.json({ examples: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const { examples } = await req.json();
    const rows = (Array.isArray(examples) ? examples : [])
      .map((e: any) => ({ part: String(e?.part ?? '').trim().slice(0, 20), image: String(e?.image ?? '').replace(/^data:image\/[a-z]+;base64,/, '') }))
      .filter((e) => e.part && e.image && e.image.length <= MAX_IMAGE_CHARS)
      .slice(0, MAX_POST)
      .map((e) => ({ ...e, user_id: user.id }));
    if (!rows.length) return NextResponse.json({ saved: 0 });

    const sb = createClient();
    const { error } = await sb.from('thermal_examples').insert(rows);
    if (error) throw new Error(error.message);

    // 부위별 최신 PER_PART장만 남기고 오래된 예시 정리
    for (const part of new Set(rows.map((r) => r.part))) {
      const { data: old } = await sb.from('thermal_examples').select('id')
        .eq('user_id', user.id).eq('part', part)
        .order('created_at', { ascending: false }).range(PER_PART, PER_PART + 200);
      if (old?.length) await sb.from('thermal_examples').delete().in('id', old.map((o) => o.id));
    }
    return NextResponse.json({ saved: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const sp = new URL(req.url).searchParams;
    const id = sp.get('id'), part = sp.get('part');
    if (!id && !part) return NextResponse.json({ error: '삭제 대상이 없습니다' }, { status: 400 });
    let q = createClient().from('thermal_examples').delete().eq('user_id', user.id);
    q = id ? q.eq('id', Number(id)) : q.eq('part', part!);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
