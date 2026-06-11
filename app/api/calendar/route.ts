import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
const KEY = 'calendar_embed_url';
const ICS_KEY = 'calendar_ics_url';

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
          calId = s;
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

export async function GET() {
    try {
          const { user, sb } = await ctx();
          const { data } = await sb.from('settings').select('key, value').in('key', [KEY, ICS_KEY]);
          const map = new Map((data || []).map((r: any) => [r.key, r.value]));
          // 비공개 iCal 주소는 비밀 토큰이 포함되므로 관리자에게만 원문 반환, 그 외엔 설정여부만.
          let isAdmin = false;
          if (user) {
                  const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
                  isAdmin = prof?.role === 'admin';
          }
          const ics = map.get(ICS_KEY) || '';
          return NextResponse.json({ url: map.get(KEY) || '', icsUrl: isAdmin ? ics : '', hasIcs: !!ics });
    } catch (e: any) {
          return NextResponse.json({ url: '', icsUrl: '', hasIcs: false, error: e.message });
    }
}

export async function POST(req: NextRequest) {
    try {
          const { user, sb } = await ctx();
          if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
          const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
          if (prof?.role !== 'admin') return NextResponse.json({ error: '관리자만 설정할 수 있습니다' }, { status: 403 });

      const body = await req.json();
          const raw = String(body.url || '').trim();
          const embed = raw ? toEmbedUrl(raw) : '';
          if (raw && !embed)
                  return NextResponse.json({ error: '구글 캘린더 주소를 인식하지 못했습니다. 임베드 주소(.../embed?...), 캘린더 열기 주소(...?cid=...), 또는 캘린더 ID(....@group.calendar.google.com)를 넣어주세요.' }, { status: 400 });

      const icsRaw = body.icsUrl !== undefined ? String(body.icsUrl || '').trim() : undefined;

      const rows: any[] = [
        { key: KEY, value: embed, label: '구글 캘린더 임베드 URL', updated_at: new Date().toISOString() },
            ];
          if (icsRaw !== undefined) {
                  if (icsRaw && !/^https?:\/\/.+/i.test(icsRaw))
                            return NextResponse.json({ error: 'ICS 주소 형식이 올바르지 않습니다. https:// 로 시작하는 iCal 공개 주소(.ics)를 넣어주세요.' }, { status: 400 });
                  rows.push({ key: ICS_KEY, value: icsRaw, label: '구글 캘린더 ICS 공개 주소', updated_at: new Date().toISOString() });
          }

      const { error } = await sb.from('settings').upsert(rows, { onConflict: 'key' });
          if (error) throw new Error(error.message);
          return NextResponse.json({ success: true });
    } catch (e: any) {
          return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
