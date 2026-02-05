// app/api/ingest/sheet/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { verifyWebhookToken } from '@/lib/webhook-auth';
import { normalizePhone, isValidPhone } from '@/lib/utils/phone-normalizer';
import { generateIdempotencyKey } from '@/lib/utils/idempotency';
import { parseOption } from '@/lib/utils/option-parser';
import { calculateStartDate, calculateEndDate, calculateRenewalStartDate, getToday, parseDateTime, toDateString, getLastLessonDate } from '@/lib/utils/date-calculator';
import dayjs from '@/lib/dayjs';
import { 
  SESSION_STATUS, 
  PAYMENT_STATUS, 
  EVENT_TYPE, 
  LOG_PROCESS_STATUS, 
  INBOX_ERROR_TYPE,
  ACTION_TYPE,
  EARLY_TERMINATION_REASON
} from '@/lib/constants';
import type { SheetWebhookPayload } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  const supabase = getServerClient();
  let rawWebhookId: string | null = null;
  
  try {
    // 1. 웹훅 토큰 검증
    if (!verifyWebhookToken(req)) {
      await logSystemEvent(supabase, EVENT_TYPE.WEBHOOK_FAILED, 'FAILED', '웹훅 인증 실패', null, LOG_PROCESS_STATUS.SUCCESS);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 요청 본문 파싱
    const payload: SheetWebhookPayload = await req.json();
    
    // 3. 필수 필드 검증
    const phone = payload['전화번호'] || payload.phone;
    const paymentDateTime = payload['일시'] || payload.timestamp;
    
    if (!phone || !paymentDateTime) {
      await logSystemEvent(
        supabase, 
        EVENT_TYPE.WEBHOOK_FAILED, 
        'FAILED', 
        '필수 필드 누락 (전화번호 또는 결제일시)',
        JSON.stringify(payload),
        LOG_PROCESS_STATUS.PENDING
      );
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 4. 멱등키 생성 및 중복 체크
    const idempotencyKey = generateIdempotencyKey(String(phone), String(paymentDateTime));
    
    const { data: existingWebhook } = await supabase
      .from('raw_webhooks')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existingWebhook) {
      await logSystemEvent(
        supabase,
        EVENT_TYPE.WEBHOOK_DUPLICATE,
        'SUCCESS',
        `중복 웹훅 무시: ${idempotencyKey}`,
        null,
        LOG_PROCESS_STATUS.SUCCESS
      );
      return NextResponse.json({ status: 'duplicate_ignored' });
    }

    // 5. Raw 데이터 저장 (Save First 원칙)
    const { data: rawWebhook, error: rawError } = await supabase
      .from('raw_webhooks')
      .insert({
        source: 'google_sheet',
        payload: payload,
        idempotency_key: idempotencyKey,
        processed: false,
      })
      .select()
      .single();

    if (rawError) {
      console.error('Raw 데이터 저장 실패:', rawError);
      await logSystemEvent(
        supabase,
        EVENT_TYPE.WEBHOOK_FAILED,
        'FAILED',
        'Raw 데이터 저장 실패',
        rawError.message,
        LOG_PROCESS_STATUS.PENDING
      );
      return NextResponse.json({ error: 'Failed to save raw data' }, { status: 500 });
    }

    rawWebhookId = rawWebhook.id;

    // 6. 결제 상태 확인 (환불인지)
    const paymentStatus = payload['상태'] || payload.status || '';
    
    if (paymentStatus === PAYMENT_STATUS.CANCELLED || paymentStatus === '결제 취소') {
      // 환불 처리 플로우
      return await processRefund(supabase, payload, rawWebhookId!);
    }

    // 6.5 재결제 시트 전용 처리 (구매옵션에 슬롯 정보 없음)
    const sheetSource = payload['_source'] || 'NEW_ENROLLMENT';
    if (sheetSource === 'RENEWAL') {
      return await processRenewalFromSheet(supabase, payload, rawWebhookId!);
    }

    // 7. 구매옵션 파싱
    const optionText = payload['구매옵션'] || payload.option || '';
    const parsed = parseOption(String(optionText));

    if (!parsed) {
      // 파싱 실패 → 인박스로
      await moveToInbox(supabase, rawWebhookId!, String(optionText), '구매옵션 파싱 실패', INBOX_ERROR_TYPE.PARSE_FAILED);
      await logSystemEvent(
        supabase,
        EVENT_TYPE.PARSE_FAILED,
        'FAILED',
        `파싱 실패: ${optionText}`,
        JSON.stringify(payload),
        LOG_PROCESS_STATUS.PENDING,
        { raw_data: payload, retryable: true }
      );
      
      // 관리자에게 파싱 실패 알림 문자
      try {
        const { sendSms } = await import('@/lib/sms/solapi');
        const adminPhone = process.env.ADMIN_PHONE_NUMBER;
        if (adminPhone) {
          const customerName = payload['이름'] || payload.name || '알수없음';
          await sendSms(
            adminPhone,
            `[크리투스 코칭] 웹훅 파싱 실패\n고객: ${customerName}\n옵션: ${String(optionText).substring(0, 20)}\n인박스 확인 필요`,
            'ADMIN'
          );
        }
      } catch (smsError) {
        console.error('파싱 실패 알림 문자 발송 실패:', smsError);
      }
      
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'parse_failed' });
    }

    // 8. 코치 찾기
    const { data: coach, error: coachError } = await supabase
      .from('coaches')
      .select('*')
      .eq('name', parsed.coach)
      .single();

    if (coachError || !coach) {
      await moveToInbox(supabase, rawWebhookId!, String(optionText), `코치 "${parsed.coach}"를 찾을 수 없음`, INBOX_ERROR_TYPE.PARSE_FAILED);
      await logSystemEvent(
        supabase,
        EVENT_TYPE.PARSE_FAILED,
        'FAILED',
        `코치를 찾을 수 없음: ${parsed.coach}`,
        JSON.stringify(payload),
        LOG_PROCESS_STATUS.PENDING,
        { raw_data: payload, retryable: true }
      );
      
      // 관리자에게 알림 문자
      try {
        const { sendSms } = await import('@/lib/sms/solapi');
        const adminPhone = process.env.ADMIN_PHONE_NUMBER;
        if (adminPhone) {
          const customerName = payload['이름'] || payload.name || '알수없음';
          await sendSms(
            adminPhone,
            `[크리투스 코칭] 코치 매칭 실패\n고객: ${customerName}\n코치: ${parsed.coach}\n인박스 확인 필요`,
            'ADMIN'
          );
        }
      } catch (smsError) {
        console.error('코치 매칭 실패 알림 문자 발송 실패:', smsError);
      }
      
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'coach_not_found' });
    }

    // 9. 슬롯 찾기
    const { data: slot, error: slotError } = await supabase
      .from('coach_slots')
      .select('*')
      .eq('coach_id', coach.id)
      .eq('day_of_week', parsed.day)
      .eq('start_time', `${parsed.time}:00`)
      .eq('is_active', true)
      .single();

    if (slotError || !slot) {
      await moveToInbox(supabase, rawWebhookId!, String(optionText), `슬롯을 찾을 수 없음: ${parsed.coach}/${parsed.day}/${parsed.time}`, INBOX_ERROR_TYPE.PARSE_FAILED);
      await logSystemEvent(
        supabase,
        EVENT_TYPE.PARSE_FAILED,
        'FAILED',
        `슬롯을 찾을 수 없음: ${parsed.coach}/${parsed.day}/${parsed.time}`,
        JSON.stringify(payload),
        LOG_PROCESS_STATUS.PENDING,
        { raw_data: payload, retryable: true }
      );
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'slot_not_found' });
    }

    // 10. 전화번호 정규화
    const normalizedPhone = normalizePhone(String(phone));
    
    if (!isValidPhone(normalizedPhone)) {
      await moveToInbox(supabase, rawWebhookId!, String(phone), '유효하지 않은 전화번호', INBOX_ERROR_TYPE.PARSE_FAILED);
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'invalid_phone' });
    }

    // 11. 수강생 찾기 또는 생성
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    const userName = payload['이름'] || payload.name || '이름없음';
    const userEmail = payload['이메일'] || payload.email || null;

    if (!user) {
      // 새 수강생 생성
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          name: String(userName),
          phone: normalizedPhone,
          email: userEmail ? String(userEmail) : null,
        })
        .select()
        .single();

      if (userError) {
        await moveToInbox(supabase, rawWebhookId!, String(optionText), `수강생 생성 실패: ${userError.message}`, INBOX_ERROR_TYPE.PARSE_FAILED);
        return NextResponse.json({ status: 'moved_to_inbox', reason: 'user_creation_failed' });
      }

      user = newUser;
    }

    // 12. 슬롯 충돌 체크 (해당 슬롯에 ACTIVE/PENDING 세션이 있는지)
    const { data: slotConflictSession } = await supabase
      .from('sessions')
      .select('*')
      .eq('slot_id', slot.id)
      .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING])
      .single();

    if (slotConflictSession && slotConflictSession.user_id !== user.id) {
      // 다른 수강생이 사용 중 → 슬롯 충돌
      await moveToInbox(
        supabase, 
        rawWebhookId!, 
        String(optionText), 
        `슬롯 충돌: ${parsed.coach}/${parsed.day}/${parsed.time} 이미 사용중`,
        INBOX_ERROR_TYPE.SLOT_CONFLICT
      );
      await logSystemEvent(
        supabase,
        EVENT_TYPE.SLOT_CONFLICT,
        'FAILED',
        `슬롯 충돌 발생: ${parsed.coach}/${parsed.day}/${parsed.time}`,
        JSON.stringify({ payload, slotConflictSession }),
        LOG_PROCESS_STATUS.PENDING,
        { raw_data: payload, retryable: true }
      );
      
      // 관리자 문자 알림
      try {
        const { sendSlotConflictAdminMessage } = await import('@/lib/sms');
        await sendSlotConflictAdminMessage(
          { name: String(userName) },
          { name: parsed.coach },
          { dayOfWeek: parsed.day, startTime: parsed.time }
        );
      } catch (smsError) {
        console.error('슬롯 충돌 관리자 문자 실패:', smsError);
      }
      
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'slot_conflict' });
    }

    // 13. 기존 세션 확인 (신규결제 시트에서 중복 체크)
    // 참고: 재결제 시트는 이미 processRenewalFromSheet()에서 처리됨
    console.log('[DEBUG] user.id:', user.id);
    console.log('[DEBUG] slot.id:', slot.id);

    // 14. 기존 세션 확인
    const { data: userSessions, error: sessionQueryError } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('slot_id', slot.id)
      .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING])
      .order('end_date', { ascending: false })
      .limit(1);

    console.log('[DEBUG] sessionQueryError:', sessionQueryError);
    console.log('[DEBUG] userSessions:', userSessions);
    console.log('[DEBUG] existingSession found:', !!userSessions?.[0]);

    const existingSession = userSessions?.[0];

    // 15. 이미 같은 슬롯에 세션이 있으면 → 인박스로 (중복 결제)
    // 참고: 여기까지 왔으면 무조건 신규결제 시트 (재결제 시트는 위에서 처리됨)
    if (existingSession) {
      const customerName = payload['이름'] || payload.name || '알수없음';
      
      await moveToInbox(
        supabase, 
        rawWebhookId!, 
        String(optionText), 
        `중복 결제 감지: 이미 같은 슬롯에 진행중인 세션 있음`,
        INBOX_ERROR_TYPE.PARSE_FAILED
      );
      
      await logSystemEvent(
        supabase,
        EVENT_TYPE.PARSE_FAILED,
        'FAILED',
        `중복 결제 감지: ${customerName} - ${parsed.coach}/${parsed.day}/${parsed.time}`,
        JSON.stringify(payload),
        LOG_PROCESS_STATUS.PENDING
      );
      
      // 관리자에게 알림 문자
      try {
        const { sendSms } = await import('@/lib/sms/solapi');
        const adminPhone = process.env.ADMIN_PHONE_NUMBER;
        if (adminPhone) {
          await sendSms(
            adminPhone,
            `[크리투스 코칭] 중복 결제 감지\n고객: ${customerName}\n슬롯: ${parsed.coach}/${parsed.day}/${parsed.time}\n기존 세션 있음 - 인박스 확인 필요`,
            'ADMIN'
          );
        }
      } catch (smsError) {
        console.error('중복 결제 알림 문자 실패:', smsError);
      }
      
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'duplicate_session' });
    }

    // 16. 시작일/종료일 계산 (신규 결제)
    const startDate = calculateStartDate(parsed.day, paymentDateTime);
    const endDate = calculateEndDate(startDate);

    // 17. 결제 정보 파싱
    const paymentAmount = payload['결제금액'] || payload.amount;
    const productName = payload['상품명'] || payload.product || '래피드코칭 4회';
    const paymentDate = toDateString(paymentDateTime);

    // 16. 세션 생성
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        coach_id: coach.id,
        slot_id: slot.id,
        day_of_week: parsed.day,
        start_time: `${parsed.time}:00`,
        start_date: startDate,
        end_date: endDate,
        extension_count: 0,
        status: SESSION_STATUS.PENDING,
        payment_amount: paymentAmount ? parseInt(String(paymentAmount).replace(/[^0-9]/g, '')) : null,
        payment_date: paymentDate,
        product_name: String(productName),
      })
      .select()
      .single();

    if (sessionError) {
      await moveToInbox(supabase, rawWebhookId!, String(optionText), `세션 생성 실패: ${sessionError.message}`, INBOX_ERROR_TYPE.PARSE_FAILED);
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'session_creation_failed' });
    }

    // 17. 활동 로그 기록
    await supabase.from('user_activity_logs').insert({
      user_id: user.id,
      session_id: session.id,
      action_type: ACTION_TYPE.ENROLL,
      metadata: {
        coach: parsed.coach,
        slot: `${parsed.day} ${parsed.time}`,
        startDate,
        endDate,
        paymentAmount,
        paymentDate,
      },
    });

    // 18. Raw 웹훅 처리 완료 표시
    await supabase
      .from('raw_webhooks')
      .update({ processed: true })
      .eq('id', rawWebhookId!);

    // 19. 시스템 로그 기록
    await logSystemEvent(
      supabase,
      EVENT_TYPE.SESSION_CREATED,
      'SUCCESS',
      `세션 생성 완료: ${user.name} → ${parsed.coach}/${parsed.day}/${parsed.time}`,
      null,
      LOG_PROCESS_STATUS.SUCCESS
    );

    // 20. 문자 발송 (신규 등록)
    try {
      const { sendNewEnrollMessages } = await import('@/lib/sms');
      
      const studentInfo = { name: String(userName), phone: normalizedPhone };
      const coachInfo = { name: coach.name, phone: coach.phone };
      const sessionInfo = {
        dayOfWeek: parsed.day,
        startTime: parsed.time,
        startDate,
        endDate: getLastLessonDate(endDate),
        openChatLink: slot.open_chat_link,
      };

      await sendNewEnrollMessages(studentInfo, coachInfo, sessionInfo);
    } catch (smsError) {
      console.error('SMS 발송 실패:', smsError);
      // 문자 실패해도 성공 응답
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        sessionId: session.id,
        isRenewal: false,
      } 
    });

  } catch (error) {
    console.error('웹훅 처리 중 오류:', error);
    await logSystemEvent(
      supabase,
      EVENT_TYPE.SYSTEM_ERROR,
      'FAILED',
      '웹훅 처리 중 시스템 오류',
      error instanceof Error ? error.message : String(error),
      LOG_PROCESS_STATUS.PENDING
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 환불 처리 함수
async function processRefund(
  supabase: ReturnType<typeof getServerClient>,
  payload: SheetWebhookPayload,
  rawWebhookId: string
) {
  const phone = payload['전화번호'] || payload.phone;
  const optionText = payload['구매옵션'] || payload.option || '';
  const cancellationReason = String(payload['취소사유'] || payload.cancelReason || '');
  
  const normalizedPhone = normalizePhone(String(phone));
  const parsed = parseOption(String(optionText));

  if (!parsed) {
    await moveToInbox(supabase, rawWebhookId!, String(optionText), '환불 처리 중 파싱 실패', INBOX_ERROR_TYPE.REFUND_MATCH_FAILED);
    return NextResponse.json({ status: 'moved_to_inbox', reason: 'refund_parse_failed' });
  }

  // 수강생 찾기
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('phone', normalizedPhone)
    .single();

  if (!user) {
    await moveToInbox(supabase, rawWebhookId!, String(optionText), `환불: 수강생을 찾을 수 없음 (${phone})`, INBOX_ERROR_TYPE.REFUND_MATCH_FAILED);
    await logSystemEvent(
      supabase,
      EVENT_TYPE.REFUND_MATCH_FAILED,
      'FAILED',
      `환불 매칭 실패: 수강생 없음 (${phone})`,
      JSON.stringify(payload),
      LOG_PROCESS_STATUS.PENDING
    );
    return NextResponse.json({ status: 'moved_to_inbox', reason: 'user_not_found' });
  }

  // 코치 찾기
  const { data: coach } = await supabase
    .from('coaches')
    .select('*')
    .eq('name', parsed.coach)
    .single();

  if (!coach) {
    await moveToInbox(supabase, rawWebhookId!, String(optionText), `환불: 코치를 찾을 수 없음 (${parsed.coach})`, INBOX_ERROR_TYPE.REFUND_MATCH_FAILED);
    return NextResponse.json({ status: 'moved_to_inbox', reason: 'coach_not_found' });
  }

  // 매칭되는 세션 찾기
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('coach_id', coach.id)
    .eq('day_of_week', parsed.day)
    .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING]);

  if (!sessions || sessions.length === 0) {
    await moveToInbox(
      supabase, 
      rawWebhookId!, 
      String(optionText), 
      `환불: 매칭되는 세션 없음 (${user.name}/${parsed.coach}/${parsed.day})`,
      INBOX_ERROR_TYPE.REFUND_MATCH_FAILED
    );
    await logSystemEvent(
      supabase,
      EVENT_TYPE.REFUND_MATCH_FAILED,
      'FAILED',
      `환불 매칭 실패: 세션 없음 (${user.name}/${parsed.coach}/${parsed.day})`,
      JSON.stringify({ payload, user, coach }),
      LOG_PROCESS_STATUS.PENDING
    );
    return NextResponse.json({ status: 'moved_to_inbox', reason: 'session_not_found' });
  }

  // 결제일 매칭으로 정확한 세션 찾기
  const refundPaymentDate = toDateString(payload['일시'] || payload.timestamp);
  let session = sessions.find(s => s.payment_date === refundPaymentDate);

  // 결제일 매칭 안 되면 인박스로 (관리자 확인 필요)
  if (!session) {
    await moveToInbox(
      supabase, 
      rawWebhookId!, 
      String(optionText), 
      `환불: 결제일 불일치 - 관리자 확인 필요 (요청: ${refundPaymentDate}, 세션: ${sessions.map(s => s.payment_date).join(', ')})`,
      INBOX_ERROR_TYPE.REFUND_MATCH_FAILED
    );
    
    // 관리자 문자 알림
    try {
      const { sendSms } = await import('@/lib/sms/solapi');
      const adminPhone = process.env.ADMIN_PHONE_NUMBER;
      if (adminPhone) {
        await sendSms(
          adminPhone,
          `[크리투스 코칭] 환불 확인 필요\n고객: ${user.name}\n슬롯: ${parsed.coach}/${parsed.day}/${parsed.time}\n결제일 불일치 - 인박스 확인`,
          'ADMIN'
        );
      }
    } catch (smsError) {
      console.error('환불 확인 알림 문자 실패:', smsError);
    }
    
    return NextResponse.json({ status: 'moved_to_inbox', reason: 'payment_date_mismatch' });
  }

  // 환불일이 수업일인 경우 → 인박스로 (당일 수업 정산 포함 여부 관리자 확인 필요)
  const today = getToday();
  const todayDayOfWeek = dayjs(today).format('ddd'); // 'Mon', 'Tue' 등
  const dayMap: Record<string, string> = { 'Sun': '일', 'Mon': '월', 'Tue': '화', 'Wed': '수', 'Thu': '목', 'Fri': '금', 'Sat': '토' };
  const todayKorean = dayMap[todayDayOfWeek];
  
  // 오늘이 해당 세션의 수업 요일인지 & 세션 기간 내인지 확인
  if (todayKorean === parsed.day && today >= session.start_date && today <= session.end_date) {
    await moveToInbox(
      supabase, 
      rawWebhookId!, 
      String(optionText), 
      `환불: 오늘이 수업일 - 당일 수업 정산 포함 여부 확인 필요 (${user.name}/${parsed.coach}/${parsed.day})`,
      INBOX_ERROR_TYPE.REFUND_MATCH_FAILED
    );
    
    try {
      const { sendSms } = await import('@/lib/sms/solapi');
      const adminPhone = process.env.ADMIN_PHONE_NUMBER;
      if (adminPhone) {
        await sendSms(
          adminPhone,
          `[크리투스 코칭] 환불 확인 필요\n고객: ${user.name}\n오늘이 수업일입니다.\n당일 수업 정산 포함 여부 인박스에서 선택`,
          'ADMIN'
        );
      }
    } catch (smsError) {
      console.error('환불 확인 알림 문자 실패:', smsError);
    }
    
    return NextResponse.json({ status: 'moved_to_inbox', reason: 'refund_on_lesson_day' });
  }

  // 세션 환불 처리
  const { error: updateError } = await supabase
    .from('sessions')
    .update({
      status: SESSION_STATUS.REFUNDED,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: cancellationReason,
      early_terminated_at: today,
      early_termination_reason: EARLY_TERMINATION_REASON.REFUND,
    })
    .eq('id', session.id);

  if (updateError) {
    await moveToInbox(supabase, rawWebhookId!, String(optionText), `환불 처리 실패: ${updateError.message}`, INBOX_ERROR_TYPE.REFUND_MATCH_FAILED);
    return NextResponse.json({ status: 'error', reason: 'update_failed' });
  }

  // 활동 로그 기록
  await supabase.from('user_activity_logs').insert({
    user_id: user.id,
    session_id: session.id,
    action_type: ACTION_TYPE.REFUND,
    reason: cancellationReason,
    metadata: {
      coach: parsed.coach,
      slot: `${parsed.day} ${parsed.time}`,
      earlyTerminatedAt: today,
    },
  });

  // Raw 웹훅 처리 완료 표시
  await supabase
    .from('raw_webhooks')
    .update({ processed: true })
    .eq('id', rawWebhookId!);

  // 시스템 로그 기록
  await logSystemEvent(
    supabase,
    EVENT_TYPE.REFUND_AUTO_PROCESSED,
    'SUCCESS',
    `환불 자동 처리 완료: ${user.name} (${parsed.coach}/${parsed.day}/${parsed.time})`,
    null,
    LOG_PROCESS_STATUS.SUCCESS
  );

  // 관리자 문자 알림
  try {
    const { sendRefundAdminMessage } = await import('@/lib/sms');
    const cancelReason = String(payload['취소사유'] || payload.cancelReason || '');
    await sendRefundAdminMessage(
      { name: user.name },
      { name: coach.name },
      { dayOfWeek: parsed.day, startTime: parsed.time },
      cancelReason
    );
  } catch (smsError) {
    console.error('환불 관리자 문자 실패:', smsError);
  }

  return NextResponse.json({ 
    success: true, 
    data: { 
      sessionId: session.id,
      status: 'refunded',
    } 
  });
}

// 인박스로 이동
async function moveToInbox(
  supabase: ReturnType<typeof getServerClient>,
  rawWebhookId: string,
  rawText: string,
  errorMessage: string,
  errorType: string
) {
  await supabase.from('ingestion_inbox').insert({
    raw_webhook_id: rawWebhookId!,
    raw_text: rawText,
    error_message: errorMessage,
    error_type: errorType,
    manual_resolution_status: 'PENDING',
  });
}

// 시스템 로그 기록
async function logSystemEvent(
  supabase: ReturnType<typeof getServerClient>,
  eventType: string,
  status: string,
  message: string,
  errorDetail: string | null,
  processStatus: string,
  extra?: { raw_data?: unknown; retryable?: boolean }
) {
  await supabase.from('system_logs').insert({
    event_type: eventType,
    status,
    message,
    error_detail: errorDetail,
    process_status: processStatus,
    raw_data: extra?.raw_data || null,
    retryable: extra?.retryable || false,
  });
}

// 재결제 시트 전용 처리 함수 (구매옵션에 슬롯 정보 없음)
async function processRenewalFromSheet(
  supabase: ReturnType<typeof getServerClient>,
  payload: SheetWebhookPayload,
  rawWebhookId: string
) {
  const phone = payload['전화번호'] || payload.phone;
  const customerName = payload['이름'] || payload.name || '알수없음';
  const normalizedPhone = normalizePhone(String(phone));
  const status = payload['상태'] || payload.status || '';

  // 0. 재결제 환불인 경우
  if (status === '결제 취소') {
    // 수강생 찾기
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    if (!user) {
      await moveToInbox(supabase, rawWebhookId, '재결제', `재결제 환불 - 수강생 없음: ${customerName}`, INBOX_ERROR_TYPE.REFUND_MATCH_FAILED);
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'user_not_found' });
    }

    // 활성 세션 조회
    const { data: activeSessions } = await supabase
      .from('sessions')
      .select('*, coach:coaches(*)')
      .eq('user_id', user.id)
      .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING])
      .order('extension_count', { ascending: false });

    if (!activeSessions || activeSessions.length === 0) {
      await moveToInbox(supabase, rawWebhookId, '재결제', `재결제 환불 - 활성 세션 없음: ${customerName}`, INBOX_ERROR_TYPE.REFUND_MATCH_FAILED);
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'no_active_session' });
    }

    // 세션 2개 이상 → 인박스로 (관리자가 선택)
    if (activeSessions.length > 1) {
      await moveToInbox(
        supabase, 
        rawWebhookId, 
        '재결제', 
        `재결제 환불 - 세션 ${activeSessions.length}개: ${customerName} (환불할 세션 선택 필요)`,
        INBOX_ERROR_TYPE.REFUND_MATCH_FAILED
      );
      
      try {
        const { sendSms } = await import('@/lib/sms/solapi');
        const adminPhone = process.env.ADMIN_PHONE_NUMBER;
        if (adminPhone) {
          await sendSms(
            adminPhone,
            `[크리투스 코칭] 재결제 환불\n고객: ${customerName}\n세션 ${activeSessions.length}개 - 인박스에서 선택`,
            'ADMIN'
          );
        }
      } catch (smsError) {
        console.error('재결제 환불 알림 문자 실패:', smsError);
      }
      
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'multiple_sessions' });
    }

    // 세션 1개 → 자동 환불 (단, 오늘이 수업일이면 인박스)
    const session = activeSessions[0];
    const today = getToday();
    const todayDayOfWeek = dayjs(today).format('ddd');
    const dayMap: Record<string, string> = { 'Sun': '일', 'Mon': '월', 'Tue': '화', 'Wed': '수', 'Thu': '목', 'Fri': '금', 'Sat': '토' };
    const todayKorean = dayMap[todayDayOfWeek];
    
    // 오늘이 해당 세션의 수업 요일인지 & 세션 기간 내인지 확인
    if (todayKorean === session.day_of_week && today >= session.start_date && today <= session.end_date) {
      await moveToInbox(
        supabase, 
        rawWebhookId, 
        '재결제', 
        `재결제 환불: 오늘이 수업일 - 당일 수업 정산 포함 여부 확인 필요 (${customerName})`,
        INBOX_ERROR_TYPE.REFUND_MATCH_FAILED
      );
      
      try {
        const { sendSms } = await import('@/lib/sms/solapi');
        const adminPhone = process.env.ADMIN_PHONE_NUMBER;
        if (adminPhone) {
          await sendSms(
            adminPhone,
            `[크리투스 코칭] 재결제 환불 확인\n고객: ${customerName}\n오늘이 수업일입니다.\n당일 수업 정산 포함 여부 인박스에서 선택`,
            'ADMIN'
          );
        }
      } catch (smsError) {
        console.error('재결제 환불 확인 알림 문자 실패:', smsError);
      }
      
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'refund_on_lesson_day' });
    }

    const cancellationReason = String(payload['취소사유'] || payload.cancelReason || '재결제 환불');

    await supabase
      .from('sessions')
      .update({
        status: SESSION_STATUS.REFUNDED,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancellationReason,
        early_terminated_at: today,
        early_termination_reason: EARLY_TERMINATION_REASON.REFUND,
      })
      .eq('id', session.id);

    // 활동 로그
    await supabase.from('user_activity_logs').insert({
      user_id: user.id,
      session_id: session.id,
      action_type: ACTION_TYPE.CANCEL,
      reason: '재결제 환불',
      metadata: { cancellationReason },
    });

    // raw_webhook 처리 완료
    await supabase
      .from('raw_webhooks')
      .update({ processed: true })
      .eq('id', rawWebhookId);

    // 시스템 로그
    await logSystemEvent(
      supabase,
      EVENT_TYPE.REFUND_AUTO_PROCESSED,
      'SUCCESS',
      `재결제 환불 완료: ${user.name} (${session.coach?.name}/${session.day_of_week}/${session.start_time})`,
      null,
      LOG_PROCESS_STATUS.SUCCESS
    );

    // 관리자 문자
    try {
      const { sendRefundAdminMessage } = await import('@/lib/sms');
      await sendRefundAdminMessage(
        { name: user.name },
        { name: session.coach?.name || '' },
        { dayOfWeek: session.day_of_week, startTime: session.start_time?.slice(0, 5) || '' },
        cancellationReason
      );
    } catch (smsError) {
      console.error('재결제 환불 관리자 문자 실패:', smsError);
    }

    return NextResponse.json({ 
      success: true, 
      data: { sessionId: session.id, status: 'refunded' } 
    });
  }

  // 1. 전화번호 유효성 검사
  if (!isValidPhone(normalizedPhone)) {
    await moveToInbox(supabase, rawWebhookId, '재결제', `유효하지 않은 전화번호: ${phone}`, INBOX_ERROR_TYPE.PARSE_FAILED);
    return NextResponse.json({ status: 'moved_to_inbox', reason: 'invalid_phone' });
  }

  // 2. 수강생 찾기
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('phone', normalizedPhone)
    .single();

  if (!user) {
    await moveToInbox(supabase, rawWebhookId, '재결제', `수강생 없음: ${customerName} (${phone})`, INBOX_ERROR_TYPE.PARSE_FAILED);
    
    try {
      const { sendSms } = await import('@/lib/sms/solapi');
      const adminPhone = process.env.ADMIN_PHONE_NUMBER;
      if (adminPhone) {
        await sendSms(
          adminPhone,
          `[크리투스 코칭] 재결제 오류\n고객: ${customerName}\n기존 수강생 없음 - 인박스 확인`,
          'ADMIN'
        );
      }
    } catch (smsError) {
      console.error('재결제 오류 알림 문자 실패:', smsError);
    }
    
    return NextResponse.json({ status: 'moved_to_inbox', reason: 'user_not_found' });
  }

  // 3. 기존 세션 찾기 (ACTIVE 또는 PENDING)
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*, coach:coaches(*), slot:coach_slots(*)')
    .eq('user_id', user.id)
    .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING])
    .order('end_date', { ascending: false });

  if (!sessions || sessions.length === 0) {
    await moveToInbox(supabase, rawWebhookId, '재결제', `진행중인 세션 없음: ${user.name}`, INBOX_ERROR_TYPE.PARSE_FAILED);
    
    try {
      const { sendSms } = await import('@/lib/sms/solapi');
      const adminPhone = process.env.ADMIN_PHONE_NUMBER;
      if (adminPhone) {
        await sendSms(
          adminPhone,
          `[크리투스 코칭] 재결제 오류\n고객: ${user.name}\n진행중인 세션 없음 - 인박스 확인`,
          'ADMIN'
        );
      }
    } catch (smsError) {
      console.error('재결제 오류 알림 문자 실패:', smsError);
    }
    
    return NextResponse.json({ status: 'moved_to_inbox', reason: 'no_active_session' });
  }

  // 4. 세션이 2개 이상이면 인박스로 (관리자 확인 필요)
  if (sessions.length > 1) {
    const sessionList = sessions.map(s => `${s.coach?.name}/${s.day_of_week}/${s.start_time}`).join(', ');
    await moveToInbox(
      supabase, 
      rawWebhookId, 
      '재결제', 
      `세션 ${sessions.length}개 - 어떤 세션 연장할지 확인 필요: ${sessionList}`,
      INBOX_ERROR_TYPE.PARSE_FAILED
    );
    
    try {
      const { sendSms } = await import('@/lib/sms/solapi');
      const adminPhone = process.env.ADMIN_PHONE_NUMBER;
      if (adminPhone) {
        await sendSms(
          adminPhone,
          `[크리투스 코칭] 재결제 확인 필요\n고객: ${user.name}\n세션 ${sessions.length}개 - 인박스 확인`,
          'ADMIN'
        );
      }
    } catch (smsError) {
      console.error('재결제 확인 알림 문자 실패:', smsError);
    }
    
    return NextResponse.json({ status: 'moved_to_inbox', reason: 'multiple_sessions' });
  }

  // 5. 세션 1개 → 자동 연장
  const session = sessions[0];
  const newStartDate = calculateRenewalStartDate(session.end_date);
  const newEndDate = calculateEndDate(newStartDate);
  const newExtensionCount = (session.extension_count || 0) + 1;

  // 결제 정보
  const paymentAmount = payload['결제금액'] || payload.amount;
  const paymentDate = toDateString(payload['일시'] || new Date().toISOString());

  // 6. 새 세션 생성 (연장)
  const { data: newSession, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      coach_id: session.coach_id,
      slot_id: session.slot_id,
      day_of_week: session.day_of_week,
      start_time: session.start_time,
      start_date: newStartDate,
      end_date: newEndDate,
      extension_count: newExtensionCount,
      status: SESSION_STATUS.PENDING,
      payment_amount: paymentAmount ? parseInt(String(paymentAmount).replace(/[^0-9]/g, '')) : null,
      payment_date: paymentDate,
      product_name: '래피드코칭 4회 (재결제)',
    })
    .select()
    .single();

  if (sessionError) {
    await moveToInbox(supabase, rawWebhookId, '재결제', `세션 생성 실패: ${sessionError.message}`, INBOX_ERROR_TYPE.PARSE_FAILED);
    return NextResponse.json({ status: 'error', reason: 'session_creation_failed' });
  }

  // 7. 활동 로그 기록
  await supabase.from('user_activity_logs').insert({
    user_id: user.id,
    session_id: newSession.id,
    action_type: ACTION_TYPE.RENEWAL,
    metadata: {
      coach: session.coach?.name,
      slot: `${session.day_of_week} ${session.start_time}`,
      previousEndDate: session.end_date,
      newStartDate,
      newEndDate,
      paymentAmount,
      paymentDate,
    },
  });

  // 8. raw_webhook processed 업데이트
  await supabase
    .from('raw_webhooks')
    .update({ processed: true })
    .eq('id', rawWebhookId);

  // 9. 시스템 로그
  await logSystemEvent(
    supabase,
    EVENT_TYPE.SESSION_CREATED,
    'SUCCESS',
    `재결제 처리 완료: ${user.name} (${session.coach?.name}/${session.day_of_week}/${session.start_time})`,
    null,
    LOG_PROCESS_STATUS.SUCCESS
  );

  // 10. 문자 발송
  try {
    const { sendRenewalMessages } = await import('@/lib/sms');
    await sendRenewalMessages(
      { name: user.name, phone: user.phone },
      { name: session.coach?.name || '', phone: session.coach?.phone || '' },
      { 
        dayOfWeek: session.day_of_week, 
        startTime: session.start_time?.substring(0, 5) || '',
        startDate: newStartDate,
        endDate: getLastLessonDate(newEndDate)
      },
      newExtensionCount
    );
  } catch (smsError) {
    console.error('재결제 문자 발송 실패:', smsError);
  }

  return NextResponse.json({ 
    status: 'success', 
    message: `재결제 완료: ${user.name}`,
    session: {
      id: newSession.id,
      startDate: newStartDate,
      endDate: newEndDate,
    }
  });
}
