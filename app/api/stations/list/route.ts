import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// GET /api/stations/list
// Cookie-based auth. Returns stations for the user's sector (admins see all).
export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'login_required' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: profile } = await supabase
      .from('profiles').select('id, role, sector_id').eq('id', user.id).single();

    let query = supabase.from('stations').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (profile?.role !== 'admin') {
      if (!profile?.sector_id) return NextResponse.json({ success: true, stations: [] });
      query = query.eq('sector_id', profile.sector_id);
    }
    const { data: stations, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, stations: stations || [] });
  } catch (e: any) {
    console.error('[stations/list] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
