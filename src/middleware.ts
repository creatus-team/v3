// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 인증이 필요한 경로
const PROTECTED_PATHS = [
  '/',
  '/coaches',
  '/students',
  '/settings',
  '/settlement',
  '/sms-logs',
  '/messages',
];

// 인증 제외 경로
const PUBLIC_PATHS = [
  '/login',
  '/embed',
  '/api',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 공개 경로는 통과
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 정적 파일은 통과
  if (pathname.includes('.') || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  // 보호된 경로 체크
  const isProtected = PROTECTED_PATHS.some(path => 
    pathname === path || pathname.startsWith(path + '/')
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // 인증 쿠키 확인
  const authCookie = request.cookies.get('rccc_admin_auth');
  
  if (!authCookie || authCookie.value !== 'authenticated') {
    // 로그인 페이지로 리다이렉트
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
