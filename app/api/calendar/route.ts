import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
const KEY = 'calendar_embed_url';

async function ctx() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  return { user, sb };
}

// GET → 저장된 캘린더 임베드 URL
export async function GET() {
  try {
    const { sb } = await ctx();
    const { data } = await sb.from('settings').select('value').eq('key', KEY).maybeSingle();
    return NextResponse.json({ url: data?.value || '' });
  } catch (e: any) {
    return NextResponse.json({ url: '', error: e.message });
  }
}

// POST { url } → 관리자만 설정
export async function POST(req: NextRequest) {
  try {
    const { user, sb } = await ctx();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
    if (prof?.role !== 'admin') return NextResponse.json({ error: '관리자만 설정할 수 있습니다' }, { status: 403 });

    const raw = String((await req.json()).url || '').trim();
    // 구글 캘린더 임베드만 허용 (보안)
    if (raw && !/^https:\/\/calendar\.google\.com\/calendar\/(embed|u\/\d+\/embed)\?/.test(raw))
      return NextResponse.json({ error: '구글 캘린더 임베드 주소(https://calendar.google.com/calendar/embed?...)를 넣어주세요' }, { status: 400 });

    const { error } = await sb.from('settings').upsert({ key: KEY, value: raw, label: '구글 캘린더 임베드 URL', updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
