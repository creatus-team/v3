// app/api/inbox/refund/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { parseOption } from '@/lib/utils/option-parser';
import { normalizePhone } from '@/lib/utils/phone-normalizer';
import { getToday, getYesterday } from '@/lib/utils/date-calculator';
import { 
  SESSION_STATUS, 
  ACTION_TYPE, 
  INBOX_STATUS, 
  EVENT_TYPE, 
  LOG_PROCESS_STATUS,
  EARLY_TERMINATION_REASON
} from '@/lib/constants';

export const dynamic = 'force-dynamic';

// 인박스에서 환불 처리
export async function POST(req: Request) {
  const supabase = getServerClient();

  try {
    const body = await req.json();
    const { inboxId, sessionId, includeTodayLesson } = body;

    if (!inboxId) {
      return NextResponse.json({ error: '인박스 ID가 필요합니다.' }, { status: 400 });
    }

    // 1. 인박스 항목 조회
    const { data: inboxItem, error: inboxError } = await supabase
      .from('ingestion_inbox')
      .select('*, raw_webhook:raw_webhooks(*)')
      .eq('id', inboxId)
      .single();

    if (inboxError || !inboxItem) {
      return NextResponse.json({ error: '인박스 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const rawPayload = inboxItem.raw_webhook?.payload;
    if (!rawPayload) {
      return NextResponse.json({ error: '원본 웹훅 데이터가 없습니다.' }, { status: 400 });
    }

    // 2. 세션 찾기 (sessionId가 있으면 직접, 없으면 검색)
    let session;
    
    if (sessionId) {
      // 직접 세션 ID로 조회
      const { data: directSession, error: sessionError } = await supabase
        .from('sessions')
        .select('*, user:users(*), coach:coaches(*)')
        .eq('id', sessionId)
        .single();
      
      if (sessionError || !directSession) {
        return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
      }
      session = directSession;
    } else {
      // 원본 데이터로 세션 검색
      const phone = rawPayload['전화번호'] || rawPayload.phone;
      const optionText = rawPayload['구매옵션'] || rawPayload.option || '';
      const parsed = parseOption(String(optionText));

      if (!parsed) {
        return NextResponse.json({ error: '구매옵션 파싱 실패' }, { status: 400 });
      }

      const normalizedPhone = normalizePhone(String(phone));

      // 수강생 찾기
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('phone', normalizedPhone)
        .single();

      if (!user) {
        return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 });
      }

      // 코치 찾기
      const { data: coach } = await supabase
        .from('coaches')
        .select('*')
        .eq('name', parsed.coach)
        .single();

      if (!coach) {
        return NextResponse.json({ error: '코치를 찾을 수 없습니다.' }, { status: 404 });
      }

      // 세션 찾기
      const { data: foundSession } = await supabase
        .from('sessions')
        .select('*, user:users(*), coach:coaches(*)')
        .eq('user_id', user.id)
        .eq('coach_id', coach.id)
        .eq('day_of_week', parsed.day)
        .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!foundSession) {
        return NextResponse.json({ error: '환불할 세션을 찾을 수 없습니다.' }, { status: 404 });
      }
      session = foundSession;
    }

    // 3. 이미 환불된 세션인지 확인
    if (session.status === SESSION_STATUS.REFUNDED) {
      return NextResponse.json({ error: '이미 환불된 세션입니다.' }, { status: 400 });
    }

    // 4. 세션 환불 처리
    // includeTodayLesson이 false면 어제 날짜로 설정 (당일 수업 정산 제외)
    const earlyTerminatedAt = includeTodayLesson === false ? getYesterday() : getToday();
    const cancellationReason = rawPayload['취소사유'] || rawPayload.cancelReason || '인박스에서 수동 환불';

    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        status: SESSION_STATUS.REFUNDED,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: String(cancellationReason),
        early_terminated_at: earlyTerminatedAt,
        early_termination_reason: EARLY_TERMINATION_REASON.REFUND,
      })
      .eq('id', session.id);

    if (updateError) {
      return NextResponse.json({ error: `환불 처리 실패: ${updateError.message}` }, { status: 500 });
    }

    // 5. 활동 로그 기록
    await supabase.from('user_activity_logs').insert({
      user_id: session.user_id,
      session_id: session.id,
      action_type: ACTION_TYPE.CANCEL,
      reason: '인박스 수동 환불',
      metadata: {
        inboxId,
        cancellationReason,
      },
    });

    // 6. 인박스 상태 업데이트
    await supabase
      .from('ingestion_inbox')
      .update({ manual_resolution_status: INBOX_STATUS.RESOLVED })
      .eq('id', inboxId);

    // 7. raw_webhook processed 업데이트
    if (inboxItem.raw_webhook_id) {
      await supabase
        .from('raw_webhooks')
        .update({ processed: true })
        .eq('id', inboxItem.raw_webhook_id);
    }

    // 8. 시스템 로그
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.REFUND_AUTO_PROCESSED,
      status: 'SUCCESS',
      message: `인박스 수동 환불: ${session.user?.name} (${session.coach?.name}/${session.day_of_week}/${session.start_time})`,
      process_status: LOG_PROCESS_STATUS.SUCCESS,
    });

    return NextResponse.json({ 
      success: true, 
      message: `${session.user?.name}님의 세션이 환불 처리되었습니다.`,
      session: {
        id: session.id,
        userName: session.user?.name,
        coachName: session.coach?.name,
        dayOfWeek: session.day_of_week,
        startTime: session.start_time,
      }
    });

  } catch (error) {
    console.error('인박스 환불 오류:', error);
    return NextResponse.json({ error: '환불 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
