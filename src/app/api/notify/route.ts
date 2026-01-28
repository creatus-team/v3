// app/api/notify/route.ts
import { NextResponse } from 'next/server';
import { sendSms, sendAdminSms } from '@/lib/sms';

export const dynamic = 'force-dynamic';

// 문자 테스트 발송
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, message, type } = body;

    // 관리자에게 테스트
    if (type === 'admin') {
      const result = await sendAdminSms(message || '[RCCC] 테스트 문자입니다.');
      return NextResponse.json(result);
    }

    // 특정 번호로 테스트
    if (!phone || !message) {
      return NextResponse.json({ error: 'phone과 message가 필요합니다.' }, { status: 400 });
    }

    const result = await sendSms(phone, message);
    return NextResponse.json(result);
  } catch (error) {
    console.error('문자 발송 오류:', error);
    return NextResponse.json({ error: '문자 발송 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
