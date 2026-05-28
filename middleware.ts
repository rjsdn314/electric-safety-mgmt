import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ============================================================
// middleware.ts — 인증 + 승인 상태 라우팅 가드
// ============================================================
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 공개 경로: 인증 불필요
  const publicPaths = ['/login', '/register', '/pending'];
  const isPublic    = publicPaths.some(p => pathname.startsWith(p));

  // Supabase 세션 확인
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll:    () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  // 비로그인 사용자 → 로그인 페이지로
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 로그인 사용자가 공개 경로 접근 → 승인 상태 확인 후 리다이렉트
  if (user && isPublic && pathname !== '/pending') {
    const { data: profile } = await supabase
      .from('profiles').select('status').eq('id', user.id).single();

    if (profile?.status === 'approved') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    if (profile?.status === 'pending') {
      return NextResponse.redirect(new URL('/pending', request.url));
    }
  }

  // 로그인 상태에서 대시보드 접근 시 승인 확인
  if (user && !isPublic && pathname !== '/pending') {
    const { data: profile } = await supabase
      .from('profiles').select('status, role').eq('id', user.id).single();

    if (profile?.status === 'pending') {
      return NextResponse.redirect(new URL('/pending', request.url));
    }
    if (profile?.status === 'rejected') {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL('/login?error=rejected', request.url));
    }

    // 관리자 전용 경로 보호
    if (pathname.startsWith('/admin') && profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|templates).*)',
  ],
};
