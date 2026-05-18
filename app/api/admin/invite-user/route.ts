import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email, name, sector_id, role } = await req.json();
  if (!email || !name) return NextResponse.json({ error: 'email, name required' }, { status: 400 });

  const adminClient = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { name } });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data.user) {
    await adminClient.from('profiles').update({ name, sector_id: sector_id || null, role: role || 'user' }).eq('id', data.user.id);
  }

  return NextResponse.json({ success: true });
}
