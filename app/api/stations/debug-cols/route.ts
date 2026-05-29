import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET /api/stations/debug-cols  -> returns the actual column names of stations
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data, error } = await supabase.from('stations').select('*').limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const cols = (data && data[0]) ? Object.keys(data[0]) : [];
    return NextResponse.json({ rowCount: data?.length || 0, columns: cols });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
