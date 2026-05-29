import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// POST /api/stations/add-one
// Add a single station (no delete). Runs on server with service_role to avoid browser auth lock.
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

    const { data: profile } = await supabase
      .from('profiles').select('id, status, sector_id').eq('id', user.id).single();
    if (profile?.status !== 'approved')
      return NextResponse.json({ error: '승인된 계정만 이용 가능합니다' }, { status: 403 });

    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: '현장명을 입력해주세요' }, { status: 400 });

    const sectorName = String(body.sector_name || '기본구역').trim() || '기본구역';

    let sectorId: string;
    const { data: existSector } = await supabase
      .from('sectors').select('id').eq('name', sectorName).maybeSingle();
    if (existSector) {
      sectorId = existSector.id;
    } else {
      const { data: newSector, error: secErr } = await supabase
        .from('sectors').insert({ name: sectorName }).select('id').single();
      if (secErr) throw new Error('구역 생성 실패: ' + secErr.message);
      sectorId = newSector!.id;
    }

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
      default_type: String(body.default_type || '월차').trim(),
      custom_values: {
        inspector_name: String(body.inspector_name || '').trim(),
        sector_label: sectorName,
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
