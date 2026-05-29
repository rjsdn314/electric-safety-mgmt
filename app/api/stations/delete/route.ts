import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// POST /api/stations/delete
// Cookie-based auth. Delete a station in the user's own sector (or admin).
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 실패 (로그인이 필요합니다)' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: profile } = await supabase
      .from('profiles').select('id, role, sector_id').eq('id', user.id).single();

    const body = await req.json();
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

    const { data: target } = await supabase
      .from('stations').select('id, sector_id').eq('id', id).single();
    if (!target) return NextResponse.json({ error: '대상을 찾을 수 없습니다' }, { status: 404 });

    const isAdmin = profile?.role === 'admin';
    const sameSector = profile?.sector_id && profile.sector_id === target.sector_id;
    if (!isAdmin && !sameSector)
      return NextResponse.json({ error: '본인 관리구역의 충전소만 삭제할 수 있습니다' }, { status: 403 });

    const { error: delErr } = await supabase.from('stations').delete().eq('id', id);
    if (delErr) throw new Error('삭제 실패: ' + delErr.message);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[stations/delete] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
