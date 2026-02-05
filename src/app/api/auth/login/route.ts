// src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    
    // 환경변수에서 비밀번호 확인 (기본값: 0728)
    const adminPassword = process.env.ADMIN_PASSWORD || '0728';
    
    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // 인증 성공 - 쿠키 설정
    const response = NextResponse.json({ success: true });
    
    response.cookies.set('rccc_admin_auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7일
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
