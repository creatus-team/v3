// app/api/notify/extension/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { sendExtensionRecommendMessage } from '@/lib/sms';
import { getLastLessonDate } from '@/lib/utils/date-calculator';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = getServerClient();

  try {
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId가 필요합니다.' }, { status: 400 });
    }

    // 세션 + 사용자 + 코치 정보 조회
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select(`
        *,
        user:users(id, name, phone),
        coach:coaches(id, name)
      `)
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!session.user?.phone) {
      return NextResponse.json({ success: false, error: '수강생 전화번호가 없습니다.' }, { status: 400 });
    }

    // 문자 발송
    const result = await sendExtensionRecommendMessage(
      { name: session.user.name, phone: session.user.phone },
      { name: session.coach?.name || '' },
      session.end_date ? getLastLessonDate(session.end_date) : session.end_date
    );

    if (result.success) {
      return NextResponse.json({ success: true, message: '연장 권유 문자가 발송되었습니다.' });
    } else {
      return NextResponse.json({ success: false, error: result.error || '문자 발송에 실패했습니다.' }, { status: 500 });
    }
  } catch (error) {
    console.error('연장 권유 문자 발송 오류:', error);
    return NextResponse.json({ success: false, error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
