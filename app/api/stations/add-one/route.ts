import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// POST /api/stations/add-one
// Cookie-based auth. Reuses the user's existing sector when no name is given.
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
      .from('profiles').select('id, status, sector_id').eq('id', user.id).single();
    if (profile?.status !== 'approved')
      return NextResponse.json({ error: '승인된 계정만 이용 가능합니다' }, { status: 403 });

    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: '현장명을 입력해주세요' }, { status: 400 });

    const rawSectorName = String(body.sector_name || '').trim();

    let sectorId: string | null = profile?.sector_id || null;
    let sectorName = '기본구역';

    const findOrCreateSector = async (nm: string) => {
      const { data: ex } = await supabase.from('sectors').select('id, name').eq('name', nm).maybeSingle();
      if (ex) return ex;
      const { data: created, error: secErr } = await supabase.from('sectors').insert({ name: nm }).select('id, name').single();
      if (secErr) throw new Error('구역 생성 실패: ' + secErr.message);
      return created!;
    };

    if (rawSectorName) {
      const sec = await findOrCreateSector(rawSectorName);
      sectorId = sec.id; sectorName = sec.name;
    } else if (sectorId) {
      const { data: cur } = await supabase.from('sectors').select('name').eq('id', sectorId).maybeSingle();
      if (cur?.name) sectorName = cur.name;
    } else {
      const sec = await findOrCreateSector('기본구역');
      sectorId = sec.id; sectorName = sec.name;
    }

    if (!sectorId) throw new Error('관리구역을 결정할 수 없습니다');

    if (!profile?.sector_id) {
      await supabase.from('profiles').update({ sector_id: sectorId }).eq('id', user.id);
    }

    const { data: inserted, error: insErr } = await supabase.from('stations').insert({
      sector_id: sectorId,
      user_id: user.id,
      name,
      base_name: name,
      voltage: Number(body.voltage) || 22900,
      capacity: Number(body.capacity) || 0,
      panel_count: Number(body.panel_count) || 1,
      custom_values: {
        owner_id: user.id,
        inspector_name: String(body.inspector_name || '').trim(),
        sector_label: sectorName,
        default_type: String(body.default_type || '월차').trim(),
        created_by: user.id,
        notes: '',
      },
      is_active: true,
    }).select('*').single();
    if (insErr) throw new Error('추가 실패: ' + insErr.message);

    return NextResponse.json({ success: true, station: inserted, sectorName });
  } catch (e: any) {
    console.error('[stations/add-one] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
