import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

async function authed() {
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

// GET /api/signature?name=홍길동  → 해당 점검자 서명 조회
export async function GET(req: NextRequest) {
  try {
    const name = (new URL(req.url).searchParams.get('name') || '').trim();
    if (!name) return NextResponse.json({ signature: null });
    const { sb } = await authed();
    const { data } = await sb.from('inspector_signatures').select('data_url, updated_at').eq('inspector_name', name).maybeSingle();
    return NextResponse.json({ signature: data?.data_url || null, updated_at: data?.updated_at || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/signature  { inspector_name, data_url }  → 등록/수정
export async function POST(req: NextRequest) {
  try {
    const { user, sb } = await authed();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const { inspector_name, data_url } = await req.json();
    const name = String(inspector_name || '').trim();
    if (!name) return NextResponse.json({ error: '점검자 이름을 입력해주세요' }, { status: 400 });
    if (!/^data:image\/(png|jpeg|jpg);base64,/.test(String(data_url || '')))
      return NextResponse.json({ error: '서명 이미지가 올바르지 않습니다' }, { status: 400 });
    // 과도한 용량 방지 (대략 2MB)
    if (String(data_url).length > 2_800_000)
      return NextResponse.json({ error: '서명 이미지 용량이 너무 큽니다(2MB 이하).' }, { status: 400 });

    const { error } = await sb.from('inspector_signatures').upsert({
      inspector_name: name, data_url, updated_by: user.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'inspector_name' });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
