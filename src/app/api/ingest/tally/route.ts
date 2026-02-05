// app/api/ingest/tally/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { normalizePhone, isValidPhone } from '@/lib/utils/phone-normalizer';
import { EVENT_TYPE, LOG_PROCESS_STATUS, INBOX_ERROR_TYPE, INBOX_STATUS } from '@/lib/constants';
import { sendTallyApplicationMessages, sendTallyDiagnosisMessages } from '@/lib/sms';

export const dynamic = 'force-dynamic';

// Tally Form ID 상수
const TALLY_FORM_IDS = {
  APPLICATION: '81qKPr',  // 코칭신청서
  DIAGNOSIS: '44agLB',    // 사전진단
};

interface TallyPayload {
  eventId?: string;
  eventType?: string;
  createdAt?: string;
  data?: {
    responseId?: string;
    submissionId?: string;
    respondentId?: string;
    formId?: string;
    formName?: string;
    createdAt?: string;
    fields?: Array<{
      key: string;
      label: string;
      type: string;
      value: unknown;
    }>;
  };
  // 직접 필드 (간단한 형식)
  name?: string;
  phone?: string;
  이름?: string;
  전화번호?: string;
}

export async function POST(req: Request) {
  const supabase = getServerClient();

  try {
    const payload: TallyPayload = await req.json();

    // 0. 중복 방지 - responseId로 체크
    const responseId = payload.data?.responseId || payload.data?.submissionId || payload.eventId;
    
    if (responseId) {
      const idempotencyKey = `tally_${responseId}`;
      
      const { data: existing } = await supabase
        .from('raw_webhooks')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .single();

      if (existing) {
        console.log(`[Tally] 중복 웹훅 무시: ${idempotencyKey}`);
        return NextResponse.json({ success: true, message: 'Already processed' });
      }

      // raw_webhooks에 저장
      await supabase.from('raw_webhooks').insert({
        source: 'TALLY',
        payload,
        idempotency_key: idempotencyKey,
        processed: false,
      });
    }

    // 1. Form ID 확인
    const formId = payload.data?.formId || '';
    let formType: 'APPLICATION' | 'DIAGNOSIS' | 'UNKNOWN' = 'UNKNOWN';
    
    if (formId === TALLY_FORM_IDS.APPLICATION) {
      formType = 'APPLICATION';
    } else if (formId === TALLY_FORM_IDS.DIAGNOSIS) {
      formType = 'DIAGNOSIS';
    }

    // 2. 데이터 추출 (Tally 형식 또는 직접 필드)
    let name = '';
    let phone = '';

    // Tally 웹훅 형식
    if (payload.data?.fields) {
      for (const field of payload.data.fields) {
        const label = field.label?.toLowerCase() || '';
        if (label.includes('이름') || label.includes('name')) {
          name = String(field.value || '');
        }
        if (label.includes('전화') || label.includes('phone') || label.includes('연락처')) {
          phone = String(field.value || '');
        }
      }
    }

    // 직접 필드
    if (!name) name = payload.이름 || payload.name || '';
    if (!phone) phone = payload.전화번호 || payload.phone || '';

    // 3. 전화번호 검증
    const normalizedPhone = normalizePhone(phone);
    
    if (!isValidPhone(normalizedPhone)) {
      await logSystemEvent(
        supabase,
        EVENT_TYPE.WEBHOOK_FAILED,
        'FAILED',
        `Tally ${formType}: 유효하지 않은 전화번호`,
        JSON.stringify(payload),
        LOG_PROCESS_STATUS.PENDING
      );
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    // 4. 수강생 찾기
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    if (!user) {
      // 인박스로 이동
      await supabase.from('ingestion_inbox').insert({
        raw_webhook_id: null,
        raw_text: `Tally ${formType}: ${name} (${phone})`,
        error_message: `Tally ${formType}: 수강생 없음 - 수동 매칭 필요 (이름: ${name}, 입력번호: ${phone})`,
        error_type: INBOX_ERROR_TYPE.TALLY_MATCH_FAILED,
        manual_resolution_status: INBOX_STATUS.PENDING,
        metadata: {
          source: 'TALLY',
          formType,
          name,
          phone,
          normalizedPhone,
          payload,
        },
      });

      await logSystemEvent(
        supabase,
        EVENT_TYPE.WEBHOOK_FAILED,
        'FAILED',
        `Tally ${formType}: 수강생 없음 (${phone}) → 인박스로 이동`,
        JSON.stringify(payload),
        LOG_PROCESS_STATUS.PENDING
      );
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'user_not_found' });
    }

    // 5. 활성 세션 찾기
    const { data: session } = await supabase
      .from('sessions')
      .select('*, coach:coaches(id, name, phone), slot:coach_slots(open_chat_link)')
      .eq('user_id', user.id)
      .in('status', ['ACTIVE', 'PENDING'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!session) {
      // 인박스로 이동
      await supabase.from('ingestion_inbox').insert({
        raw_webhook_id: null,
        raw_text: `Tally ${formType}: ${user.name} (${user.phone})`,
        error_message: `Tally ${formType}: 활성 세션 없음 - 수동 처리 필요 (이름: ${user.name})`,
        error_type: INBOX_ERROR_TYPE.TALLY_MATCH_FAILED,
        manual_resolution_status: INBOX_STATUS.PENDING,
        metadata: {
          source: 'TALLY',
          formType,
          name: user.name,
          phone: user.phone,
          userId: user.id,
          payload,
        },
      });

      await logSystemEvent(
        supabase,
        EVENT_TYPE.WEBHOOK_FAILED,
        'FAILED',
        `Tally ${formType}: 활성 세션 없음 (${user.name}) → 인박스로 이동`,
        JSON.stringify(payload),
        LOG_PROCESS_STATUS.PENDING
      );
      return NextResponse.json({ status: 'moved_to_inbox', reason: 'no_active_session' });
    }

    // 6. 문자 발송 (폼 타입에 따라 다른 함수 호출) - try-catch로 격리
    try {
      const openChatLink = session.slot?.open_chat_link || '';
      
      if (formType === 'APPLICATION') {
        // 코칭신청서
        await sendTallyApplicationMessages(
          { name: user.name, phone: normalizedPhone },
          { name: session.coach?.name || '', phone: session.coach?.phone }
        );
      } else if (formType === 'DIAGNOSIS') {
        // 사전진단 (오픈톡 링크 필요)
        await sendTallyDiagnosisMessages(
          { name: user.name, phone: normalizedPhone },
          { name: session.coach?.name || '', phone: session.coach?.phone },
          openChatLink
        );
      } else {
        // 알 수 없는 폼 - 로그만 남김
        await logSystemEvent(
          supabase,
          EVENT_TYPE.WEBHOOK_RECEIVED,
          'WARNING',
          `Tally: 알 수 없는 폼 (${formId})`,
          JSON.stringify(payload),
          LOG_PROCESS_STATUS.PENDING
        );
      }
    } catch (smsError) {
      // SMS 실패해도 폼 처리는 성공으로
      console.error('Tally SMS 발송 실패:', smsError);
    }

    // 7. 시스템 로그
    await logSystemEvent(
      supabase,
      `TALLY_${formType}_RECEIVED`,
      'SUCCESS',
      `Tally ${formType} 처리: ${user.name} → ${session.coach?.name}`,
      null,
      LOG_PROCESS_STATUS.SUCCESS
    );

    // 8. raw_webhooks processed 업데이트
    if (responseId) {
      await supabase
        .from('raw_webhooks')
        .update({ processed: true })
        .eq('idempotency_key', `tally_${responseId}`);
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        sessionId: session.id,
        formType,
        message: `${user.name}님의 ${formType === 'APPLICATION' ? '코칭신청서' : '사전진단'}가 처리되었습니다.`,
      },
    });
  } catch (error) {
    console.error('Tally 웹훅 처리 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 시스템 로그 기록
async function logSystemEvent(
  supabase: ReturnType<typeof getServerClient>,
  eventType: string,
  status: string,
  message: string,
  errorDetail: string | null,
  processStatus: string
) {
  await supabase.from('system_logs').insert({
    event_type: eventType,
    status,
    message,
    error_detail: errorDetail,
    process_status: processStatus,
  });
}
