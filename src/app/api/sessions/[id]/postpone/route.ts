// app/api/sessions/[id]/postpone/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import dayjs from '@/lib/dayjs';
import { ACTION_TYPE, EVENT_TYPE, LOG_PROCESS_STATUS } from '@/lib/constants';
import { sendPostponeMessages } from '@/lib/sms';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const sessionId = params.id;

  try {
    const body = await req.json();
    const { weeks, reason } = body;

    if (!weeks || weeks < 1 || weeks > 3) {
      return NextResponse.json({ error: '연기 기간은 1~3주만 가능합니다.' }, { status: 400 });
    }

    // 1. 세션 조회
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, user:users(id, name, phone)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (session.status !== 'ACTIVE' && session.status !== 'PENDING') {
      return NextResponse.json({ error: '활성 상태의 세션만 연기할 수 있습니다.' }, { status: 400 });
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

    // 2. 기존 연기 기록 조회
    const { data: existingPostponements } = await supabase
      .from('postponements')
      .select('postponed_date')
      .eq('session_id', sessionId)
      .order('postponed_date', { ascending: false });

    const alreadyPostponedDates = new Set(
      existingPostponements?.map(p => p.postponed_date) || []
    );

    // 3. 연기할 날짜들 계산
    const today = dayjs();
    const dayMap: Record<string, number> = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
    const targetDayIndex = dayMap[session.day_of_week];
    const postponedDates: string[] = [];

    // 시작 기준점 결정: 마지막 연기일 또는 오늘
    let startFrom = today;
    if (existingPostponements && existingPostponements.length > 0) {
      const lastPostponedDate = dayjs(existingPostponements[0].postponed_date);
      if (lastPostponedDate.isAfter(today) || lastPostponedDate.isSame(today, 'day')) {
        startFrom = lastPostponedDate;
      }
    }

    // 오늘이 수업 요일이고, 세션 기간 내이고, 아직 연기 안 됐으면 오늘부터 체크
    const todayStr = today.format('YYYY-MM-DD');
    const isTodayLessonDay = today.day() === targetDayIndex 
      && todayStr >= session.start_date 
      && todayStr <= session.end_date
      && !alreadyPostponedDates.has(todayStr);

    let checkDate;
    if (isTodayLessonDay && startFrom.isSame(today, 'day')) {
      // 오늘이 수업일이고 연기 가능하면 오늘부터 시작
      checkDate = today;
    } else {
      // 그 외에는 시작점 이후의 첫 해당 요일 찾기
      checkDate = startFrom.add(1, 'day');
      while (checkDate.day() !== targetDayIndex) {
        checkDate = checkDate.add(1, 'day');
      }
    }

    // 세션 종료일까지의 수업일 중 연기되지 않은 날짜 선택
    while (postponedDates.length < weeks && checkDate.isBefore(dayjs(session.end_date).add(1, 'day'))) {
      const dateStr = checkDate.format('YYYY-MM-DD');
      
      // 이미 연기된 날짜가 아니고, 세션 시작일 이후인 경우만
      if (!alreadyPostponedDates.has(dateStr) && dateStr >= session.start_date) {
        postponedDates.push(dateStr);
      }
      
      checkDate = checkDate.add(7, 'day'); // 다음 주 같은 요일
    }

    // 연기할 날짜가 부족한 경우
    if (postponedDates.length < weeks) {
      return NextResponse.json({ 
        error: `연기 가능한 수업이 ${postponedDates.length}개뿐입니다. (요청: ${weeks}주)`,
      }, { status: 400 });
    }

    // 4. 연기 기록 추가
    const postponeRecords = postponedDates.map(date => ({
      session_id: sessionId,
      postponed_date: date,
      reason: reason || null,
    }));

    const { error: postponeError } = await supabase
      .from('postponements')
      .insert(postponeRecords);

    if (postponeError) {
      console.error('연기 기록 저장 실패:', postponeError);
      return NextResponse.json({ error: '연기 기록 저장에 실패했습니다.' }, { status: 500 });
    }

    // 4. 종료일 연장 (연기한 주 수만큼)
    const newEndDate = dayjs(session.end_date).add(weeks * 7, 'day').format('YYYY-MM-DD');

    const { error: updateError } = await supabase
      .from('sessions')
      .update({ end_date: newEndDate })
      .eq('id', sessionId);

    if (updateError) {
      console.error('세션 업데이트 실패:', updateError);
    }

    // 5. 활동 로그 기록
    await supabase.from('user_activity_logs').insert({
      user_id: session.user_id,
      session_id: sessionId,
      action_type: ACTION_TYPE.POSTPONE,
      reason: reason || `${weeks}주 연기`,
      metadata: { weeks, postponed_dates: postponedDates, new_end_date: newEndDate },
    });

    // 6. 시스템 로그
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.SESSION_POSTPONED,
      status: 'SUCCESS',
      message: `수강 연기: ${session.user?.name} - ${weeks}주 (${postponedDates.join(', ')})`,
      process_status: LOG_PROCESS_STATUS.SUCCESS,
    });

    // 7. 문자 발송
    const { data: coachData } = await supabase
      .from('coaches')
      .select('name, phone')
      .eq('id', session.coach_id)
      .single();

    // 재개일 계산 (마지막 연기일 + 1주)
    const lastPostponedDate = postponedDates[postponedDates.length - 1];
    const resumeDate = dayjs(lastPostponedDate).add(7, 'day').format('YYYY-MM-DD');

    await sendPostponeMessages(
      { name: session.user?.name || '', phone: session.user?.phone || '' },
      { name: coachData?.name || '', phone: coachData?.phone },
      postponedDates,
      newEndDate,
      { dayOfWeek: session.day_of_week, startTime: session.start_time?.slice(0, 5) },
      resumeDate
    );

    return NextResponse.json({
      success: true,
      postponedDates,
      newEndDate,
    });
  } catch (error) {
    console.error('연기 처리 오류:', error);
    return NextResponse.json({ error: '연기 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
