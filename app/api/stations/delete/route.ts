import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// POST /api/stations/delete
// Delete a single station owned by the requesting user.
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: '인증 실패' }, { status: 401 });

    const body = await req.json();
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

    // only allow deleting own station
    const { data: target } = await supabase
      .from('stations').select('id, user_id').eq('id', id).single();
    if (!target) return NextResponse.json({ error: '대상을 찾을 수 없습니다' }, { status: 404 });
    if (target.user_id !== user.id)
      return NextResponse.json({ error: '본인 소유의 관리구역만 삭제할 수 있습니다' }, { status: 403 });

    const { error: delErr } = await supabase.from('stations').delete().eq('id', id).eq('user_id', user.id);
    if (delErr) throw new Error('삭제 실패: ' + delErr.message);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[stations/delete] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
