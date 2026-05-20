import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 공개 경로
  const publicPaths = ['/login', '/api', '/_next', '/favicon'];
  const isPublic = publicPaths.some(p => pathname.startsWith(p));

  // 로그인 쿠키 확인
  const token = request.cookies.get('sb-ktvcrtirleibskfotjnu-auth-token');

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(token ? '/dashboard' : '/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|templates/).*)'],
};