// 관리자: 등록된 양식 삭제 (Storage + DB)
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { station_id, inspection_group = '분기' } = await req.json();
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const GROUP_FILE: Record<string, string> = { '분기': 'quarterly.xlsx', '반기': 'semiannual.xlsx' };
    await sb.storage.from('templates').remove([`${station_id}/${GROUP_FILE[inspection_group] || 'quarterly.xlsx'}`]);
    const { error } = await sb.from('station_templates')
      .delete().eq('station_id', station_id).eq('inspection_group', inspection_group);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
