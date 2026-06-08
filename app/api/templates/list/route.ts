// 충전소별 양식 현황 조회 — 비관리자는 본인이 등록한 충전소만, 관리자는 전체
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authClient.auth.getUser();

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let isAdmin = false;
    if (user) {
      const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single();
      isAdmin = p?.role === 'admin';
    }

    let sq = sb.from('stations').select('id, name, base_name').eq('is_active', true).order('name');
    if (!isAdmin && user) sq = sq.eq('user_id', user.id); // 비관리자: 본인 등록 충전소만
    const { data: stations } = await sq;

    const { data: templates } = await sb.from('station_templates').select('*');

    const tplByStation = new Map<string, any[]>();
    for (const t of templates || []) {
      const arr = tplByStation.get(t.station_id) || [];
      arr.push(t);
      tplByStation.set(t.station_id, arr);
    }

    const rows = (stations || []).map((s) => ({
      station_id: s.id,
      name: s.name,
      base_name: s.base_name,
      templates: (tplByStation.get(s.id) || []).map((t) => ({
        inspection_group: t.inspection_group,
        original_name: t.original_name,
        byeolji7_count: t.byeolji7_count,
        has_insulation: t.has_insulation,
        has_ground: t.has_ground,
        updated_at: t.updated_at,
      })),
    }));

    return NextResponse.json({
      success: true,
      total_stations: rows.length,
      registered: rows.filter((r) => r.templates.length > 0).length,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
