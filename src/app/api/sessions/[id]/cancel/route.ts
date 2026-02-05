// app/api/sessions/[id]/cancel/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import dayjs from '@/lib/dayjs';
import { SESSION_STATUS, ACTION_TYPE, EVENT_TYPE, LOG_PROCESS_STATUS } from '@/lib/constants';
import { sendCancelMessages } from '@/lib/sms';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const sessionId = params.id;

  try {
    const body = await req.json();
    const { reason } = body;

    if (!reason) {
      return NextResponse.json({ error: '취소 사유는 필수입니다.' }, { status: 400 });
    }

    // 1. 세션 조회
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, user:users(id, name, phone), coach:coaches(id, name)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (session.status !== 'ACTIVE' && session.status !== 'PENDING') {
      return NextResponse.json({ error: '활성 상태의 세션만 취소할 수 있습니다.' }, { status: 400 });
    }

    // 1-1. 정산 확정 여부 체크
    const sessionYear = dayjs(session.start_date).year();
    const sessionMonth = dayjs(session.start_date).month() + 1;
    const { data: settlementLock } = await supabase
      .from('settlement_locks')
      .select('id')
      .eq('year', sessionYear)
      .eq('month', sessionMonth)
      .is('unlocked_at', null)
      .single();

    if (settlementLock && !body.forceUpdate) {
      return NextResponse.json({ 
        error: '해당 월은 정산이 확정되었습니다.', 
        isLocked: true,
        targetMonth: `${sessionYear}-${String(sessionMonth).padStart(2, '0')}`,
      }, { status: 400 });
    }

    // 2. 세션 상태 변경
    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        status: SESSION_STATUS.CANCELLED,
        cancelled_at: dayjs().toISOString(),
        cancellation_reason: reason,
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('세션 취소 실패:', updateError);
      return NextResponse.json({ error: '세션 취소에 실패했습니다.' }, { status: 500 });
    }

    // 3. 활동 로그 기록
    await supabase.from('user_activity_logs').insert({
      user_id: session.user_id,
      session_id: sessionId,
      action_type: ACTION_TYPE.CANCEL,
      reason: reason,
      metadata: { 
        coach_name: session.coach?.name,
        day_of_week: session.day_of_week,
        start_time: session.start_time,
      },
    });

    // 4. 시스템 로그
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.SESSION_CANCELLED,
      status: 'SUCCESS',
      message: `수강 취소: ${session.user?.name} (${session.coach?.name}/${session.day_of_week}/${session.start_time})`,
      process_status: LOG_PROCESS_STATUS.SUCCESS,
      raw_data: { reason },
    });

    // TODO: 문자 발송 (수강생, 코치, 관리자)
    // 코치 전화번호 조회
    const { data: coachData } = await supabase
      .from('coaches')
      .select('phone')
      .eq('id', session.coach_id)
      .single();

    await sendCancelMessages(
      { name: session.user?.name || '', phone: session.user?.phone || '' },
      { name: session.coach?.name || '', phone: coachData?.phone },
      { dayOfWeek: session.day_of_week, startTime: session.start_time },
      reason
    );

    return NextResponse.json({
      success: true,
      message: '수강이 취소되었습니다.',
    });
  } catch (error) {
    console.error('취소 처리 오류:', error);
    return NextResponse.json({ error: '취소 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
