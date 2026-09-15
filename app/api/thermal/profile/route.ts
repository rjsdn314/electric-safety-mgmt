// ============================================================
// app/api/thermal/profile/route.ts
// 계정별 열화상 촬영 부위 목록 조회/저장
//  GET  → { parts, is_default }
//  POST { parts } → 저장
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRouteUser } from '@/lib/supabase/route-user';
import { DEFAULT_PARTS, sanitizeParts } from '@/lib/thermal/parts';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const { data } = await createClient().from('thermal_part_profiles').select('parts').eq('user_id', user.id).maybeSingle();
    const parts = sanitizeParts(data?.parts);
    return NextResponse.json({ parts: parts.length ? parts : DEFAULT_PARTS, is_default: !parts.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const { parts: raw } = await req.json();
    const parts = sanitizeParts(raw);
    if (!parts.length) return NextResponse.json({ error: '부위를 하나 이상 입력해주세요' }, { status: 400 });
    const { error } = await createClient().from('thermal_part_profiles')
      .upsert({ user_id: user.id, parts, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return NextResponse.json({ parts, is_default: false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
