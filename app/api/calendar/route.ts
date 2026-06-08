import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
const KEY = 'calendar_embed_url';

// 다양한 입력을 구글 캘린더 임베드 URL로 정규화:
//  · 이미 임베드(.../embed?...) → 그대로
//  · 캘린더 열기 주소(...?cid=BASE64) → cid 디코딩 → 임베드
//  · 캘린더 ID(xxxx@group.calendar.google.com / @gmail.com) → 임베드
function toEmbedUrl(raw: string): string | null {
  const s = raw.trim();
  if (/^https:\/\/calendar\.google\.com\/calendar\/(u\/\d+\/)?embed\?/.test(s)) return s;
  let calId: string | null = null;
  const cid = s.match(/[?&]cid=([^&]+)/);
  if (cid) {
    try {
      const dec = Buffer.from(decodeURIComponent(cid[1]).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      if (dec.includes('@')) calId = dec;
    } catch { /* ignore */ }
  } else if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(s)) {
    calId = s; // 순수 캘린더 ID
  }
  if (calId) return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calId)}&ctz=Asia%2FSeoul`;
  return null;
}

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
    const embed = raw ? toEmbedUrl(raw) : '';
    if (raw && !embed)
      return NextResponse.json({ error: '구글 캘린더 주소를 인식하지 못했습니다. 임베드 주소(.../embed?...), 캘린더 열기 주소(...?cid=...), 또는 캘린더 ID(....@group.calendar.google.com)를 넣어주세요.' }, { status: 400 });

    const { error } = await sb.from('settings').upsert({ key: KEY, value: embed, label: '구글 캘린더 임베드 URL', updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
