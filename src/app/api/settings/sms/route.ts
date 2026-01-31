// app/api/settings/sms/route.ts
import { NextResponse } from 'next/server';
import { getSmsSettings, updateSmsSettings, SmsEnabledSettings } from '@/lib/utils/sms-settings';

export const dynamic = 'force-dynamic';

// 설정 조회
export async function GET() {
  try {
    const settings = await getSmsSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('SMS 설정 조회 오류:', error);
    return NextResponse.json({ success: false, error: '설정 조회 실패' }, { status: 500 });
  }
}

// 설정 저장
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { STUDENT, COACH, ADMIN } = body as SmsEnabledSettings;

    // 유효성 검사
    if (typeof STUDENT !== 'boolean' || typeof COACH !== 'boolean' || typeof ADMIN !== 'boolean') {
      return NextResponse.json({ success: false, error: '잘못된 설정값' }, { status: 400 });
    }

    const success = await updateSmsSettings({ STUDENT, COACH, ADMIN });

    if (!success) {
      return NextResponse.json({ success: false, error: '설정 저장 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('SMS 설정 저장 오류:', error);
    return NextResponse.json({ success: false, error: '설정 저장 실패' }, { status: 500 });
  }
}
