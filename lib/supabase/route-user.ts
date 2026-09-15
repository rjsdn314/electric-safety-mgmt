// API 라우트에서 쿠키 세션으로 로그인 사용자 확인
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getRouteUser() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  return user;
}
