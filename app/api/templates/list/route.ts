// 관리자: 등록된 충전소별 양식 현황 조회
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: stations } = await sb
      .from('stations').select('id, name, base_name').eq('is_active', true).order('name');
    const { data: templates } = await sb
      .from('station_templates').select('*');

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
