// lib/sms/index.ts
import { sendSms, sendAdminSms, sendSmsBulk } from './solapi';
import { getServerClient } from '@/lib/supabase/server';
import { EVENT_TYPE, LOG_PROCESS_STATUS } from '@/lib/constants';
import { getSmsSettings } from '@/lib/utils/sms-settings';

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

interface TemplateVariables {
  수강생명?: string;
  코치명?: string;
  요일?: string;
  시간?: string;
  이전시간?: string;
  시작일?: string;
  종료일?: string;
  연기날짜?: string;
  연기주수?: string;
  재개일?: string;
  오픈톡링크?: string;
  취소사유?: string;
  원본데이터?: string;
  오류메시지?: string;
  회차?: string;
  수업목록?: string;
  총건수?: string;
}

// 변수 치환
function replaceVariables(content: string, variables: TemplateVariables): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined && value !== null) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
  }
  return result;
}

// 스킵 결과 생성
function skippedResult(target: string): SendResult {
  console.log(`[SMS] ${target} 문자 발송 OFF - 스킵됨`);
  return { success: true, skipped: true };
}

// DB에서 템플릿 조회
async function getTemplates(eventType: string) {
  const supabase = getServerClient();
  const { data } = await supabase
    .from('sms_templates')
    .select('*')
    .eq('event_type', eventType)
    .eq('is_active', true);
  return data || [];
}

// 미치환 변수 감지
function detectUnreplacedVariables(content: string): string[] {
  const matches = content.match(/\{[^}]+\}/g);
  return matches || [];
}

// 시스템 로그 기록 + 관리자 알림
async function logSmsWarning(message: string, detail?: string, sendAlert: boolean = true) {
  const supabase = getServerClient();
  await supabase.from('system_logs').insert({
    event_type: EVENT_TYPE.SMS_WARNING,
    status: 'WARNING',
    message,
    error_detail: detail,
    process_status: LOG_PROCESS_STATUS.PENDING,
  });
  
  // 🔔 관리자에게 즉시 알림 (무한루프 방지: sendAlert=false로 호출 가능)
  if (sendAlert && process.env.ADMIN_PHONE_NUMBER) {
    try {
      await sendSms(
        process.env.ADMIN_PHONE_NUMBER,
        `[RCCC 경고] ${message}\n${detail || ''}`.slice(0, 90),
        'ADMIN'
      );
    } catch (e) {
      console.error('[SMS] 관리자 알림 발송 실패:', e);
    }
  }
}

// 재시도 로직 포함 발송
async function sendWithRetry(
  phone: string,
  message: string,
  recipientType: 'STUDENT' | 'COACH' | 'ADMIN',
  maxRetries: number = 2
): Promise<SendResult> {
  let lastError: string | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await sendSms(phone, message, recipientType);
    
    if (result.success) {
      return result;
    }
    
    lastError = result.error;
    console.warn(`[SMS] 발송 실패 (시도 ${attempt}/${maxRetries}): ${lastError}`);
    
    // 마지막 시도가 아니면 1초 대기 후 재시도
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return { success: false, error: `${maxRetries}회 재시도 후 실패: ${lastError}` };
}

// DB 템플릿 기반 발송 (안전장치 포함)
async function sendByDbTemplate(
  eventType: string,
  variables: TemplateVariables,
  recipients: { STUDENT?: string; COACH?: string; ADMIN?: string }
): Promise<Array<{ target: string; result: SendResult }>> {
  const results: Array<{ target: string; result: SendResult }> = [];
  const SMS_ENABLED = await getSmsSettings();
  const templates = await getTemplates(eventType);
  const supabase = getServerClient();
  
  // 실패 추적 (알림 폭탄 방지용)
  const failures: string[] = [];

  // 🔒 안전장치 1: 템플릿 없으면 시스템 로그 + 관리자 알림
  if (templates.length === 0) {
    await logSmsWarning(
      `SMS 템플릿 없음: ${eventType}`,
      `이벤트 타입 "${eventType}"에 대한 활성화된 템플릿이 없습니다.`
    );
    console.warn(`[SMS] 템플릿 없음: ${eventType}`);
    return results;
  }

  for (const template of templates) {
    const recipientType = template.recipient_type as 'STUDENT' | 'COACH' | 'ADMIN';
    const phone = recipients[recipientType];

    // ON/OFF 체크
    if (!SMS_ENABLED[recipientType]) {
      results.push({ target: recipientType.toLowerCase(), result: skippedResult(recipientType) });
      continue;
    }

    // 번호 없음
    if (!phone) {
      results.push({ target: recipientType.toLowerCase(), result: { success: true, skipped: true } });
      continue;
    }

    // 변수 치환
    const content = replaceVariables(template.content, variables);

    // 🔒 안전장치 2: 미치환 변수 있으면 발송 차단
    const unreplacedVars = detectUnreplacedVariables(content);
    if (unreplacedVars.length > 0) {
      await supabase.from('system_logs').insert({
        event_type: EVENT_TYPE.SMS_WARNING,
        status: 'WARNING',
        message: `미치환 변수로 발송 차단: ${eventType}`,
        error_detail: `템플릿 "${template.name}"에서 치환되지 않은 변수: ${unreplacedVars.join(', ')}`,
        process_status: LOG_PROCESS_STATUS.PENDING,
      });
      console.warn(`[SMS] 미치환 변수로 발송 차단: ${unreplacedVars.join(', ')}`);
      failures.push(`${recipientType}: 미치환 변수`);
      results.push({ 
        target: recipientType.toLowerCase(), 
        result: { success: false, error: `미치환 변수: ${unreplacedVars.join(', ')}` } 
      });
      continue;
    }

    // 🔒 안전장치 3: 재시도 로직 포함 발송
    const result = await sendWithRetry(phone, content, recipientType);
    
    // 발송 결과 로깅 (ADMIN 포함 모두)
    await supabase.from('system_logs').insert({
      event_type: result.success ? EVENT_TYPE.SMS_SENT : EVENT_TYPE.SMS_FAILED,
      status: result.success ? 'SUCCESS' : 'FAILED',
      message: result.success 
        ? `문자 발송 성공: ${phone.slice(-4)}` 
        : `문자 발송 실패: ${phone.slice(-4)}`,
      error_detail: result.error,
      process_status: result.success ? LOG_PROCESS_STATUS.SUCCESS : LOG_PROCESS_STATUS.PENDING,
      raw_data: { phone, eventType, recipientType, messageId: result.messageId, ...variables },
    });
    
    if (!result.success) {
      failures.push(`${recipientType}: ${phone.slice(-4)}`);
    }
    
    results.push({ target: recipientType.toLowerCase(), result });
  }

  // 🔔 알림 폭탄 방지: 실패가 있으면 한 번만 요약 알림
  if (failures.length > 0 && process.env.ADMIN_PHONE_NUMBER) {
    try {
      await sendSms(
        process.env.ADMIN_PHONE_NUMBER,
        `[RCCC] ${eventType} 발송 실패\n${failures.join(', ')}`.slice(0, 90),
        'ADMIN'
      );
    } catch (e) {
      console.error('[SMS] 요약 알림 발송 오류:', e);
    }
  }

  return results;
}

// ===== 신규 등록 =====
export async function sendNewEnrollMessages(
  student: { name: string; phone: string },
  coach: { name: string; phone?: string },
  session: { dayOfWeek: string; startTime: string; startDate: string; endDate: string; openChatLink?: string }
) {
  return sendByDbTemplate('NEW_ENROLL', {
    수강생명: student.name,
    코치명: coach.name,
    요일: session.dayOfWeek,
    시간: session.startTime,
    시작일: session.startDate,
    종료일: session.endDate,
    오픈톡링크: session.openChatLink || '',
  }, {
    STUDENT: student.phone,
    COACH: coach.phone,
    ADMIN: process.env.ADMIN_PHONE_NUMBER,
  });
}

// ===== 재결제 (연장) =====
export async function sendRenewalMessages(
  student: { name: string; phone: string },
  coach: { name: string; phone?: string },
  session: { dayOfWeek: string; startTime: string; startDate: string; endDate: string },
  extensionCount: number
) {
  return sendByDbTemplate('RENEWAL', {
    수강생명: student.name,
    코치명: coach.name,
    요일: session.dayOfWeek,
    시간: session.startTime,
    시작일: session.startDate,
    종료일: session.endDate,
    회차: `${extensionCount + 1}`,
  }, {
    STUDENT: student.phone,
    COACH: coach.phone,
  });
}

// ===== 환불 =====
export async function sendRefundAdminMessage(
  student: { name: string },
  coach: { name: string },
  session: { dayOfWeek: string; startTime: string },
  cancelReason?: string
) {
  const results = await sendByDbTemplate('REFUND', {
    수강생명: student.name,
    코치명: coach.name,
    요일: session.dayOfWeek,
    시간: session.startTime,
    취소사유: cancelReason || '',
  }, {
    ADMIN: process.env.ADMIN_PHONE_NUMBER,
  });
  return results[0]?.result || skippedResult('관리자');
}

export async function sendRefundMatchFailMessage(rawData: string) {
  const results = await sendByDbTemplate('REFUND_MATCH_FAIL', {
    원본데이터: rawData,
  }, {
    ADMIN: process.env.ADMIN_PHONE_NUMBER,
  });
  return results[0]?.result || skippedResult('관리자');
}

// ===== 수강 취소 =====
export async function sendCancelMessages(
  student: { name: string; phone: string },
  coach: { name: string; phone?: string },
  session: { dayOfWeek: string; startTime: string },
  reason: string
) {
  return sendByDbTemplate('CANCEL', {
    수강생명: student.name,
    코치명: coach.name,
    요일: session.dayOfWeek,
    시간: session.startTime,
    취소사유: reason,
  }, {
    STUDENT: student.phone,
    COACH: coach.phone,
    ADMIN: process.env.ADMIN_PHONE_NUMBER,
  });
}

// ===== 수강 연기 =====
export async function sendPostponeMessages(
  student: { name: string; phone: string },
  coach: { name: string; phone?: string },
  postponedDates: string[],
  newEndDate: string,
  session?: { dayOfWeek?: string; startTime?: string },
  resumeDate?: string
) {
  // 날짜 포맷 변환 (2026-02-09 → 2/9)
  const formattedDates = postponedDates.map(d => {
    const [, month, day] = d.split('-');
    return `${parseInt(month)}/${parseInt(day)}`;
  }).join(', ');

  // 재개일 포맷
  let formattedResumeDate = '';
  if (resumeDate) {
    const [, month, day] = resumeDate.split('-');
    formattedResumeDate = `${parseInt(month)}/${parseInt(day)}`;
  }

  return sendByDbTemplate('POSTPONE', {
    수강생명: student.name,
    코치명: coach.name,
    연기날짜: formattedDates,
    연기주수: String(postponedDates.length),
    재개일: formattedResumeDate,
    종료일: newEndDate,
    요일: session?.dayOfWeek || '',
    시간: session?.startTime || '',
  }, {
    STUDENT: student.phone,
    COACH: coach.phone,
  });
}

// ===== 슬롯 충돌 =====
export async function sendSlotConflictMessage(
  student: { name: string },
  requestedSlot: string,
  existingStudent: string
) {
  const results = await sendByDbTemplate('SLOT_CONFLICT', {
    수강생명: student.name,
    원본데이터: `요청: ${requestedSlot}, 기존: ${existingStudent}`,
  }, {
    ADMIN: process.env.ADMIN_PHONE_NUMBER,
  });
  return results[0]?.result || skippedResult('관리자');
}

export async function sendSlotConflictAdminMessage(
  student: { name: string },
  coach: { name: string },
  session: { dayOfWeek: string; startTime: string }
) {
  return sendSlotConflictMessage(
    student,
    `${coach.name}/${session.dayOfWeek}/${session.startTime}`,
    '(인박스 확인)'
  );
}

// ===== 시스템 오류 =====
export async function sendSystemErrorMessage(errorMessage: string) {
  const results = await sendByDbTemplate('SYSTEM_ERROR', {
    오류메시지: errorMessage,
  }, {
    ADMIN: process.env.ADMIN_PHONE_NUMBER,
  });
  return results[0]?.result || skippedResult('관리자');
}

// ===== 리마인더 (D-1, D-2) =====
export async function sendReminderMessages(
  student: { name: string; phone: string },
  coach: { name: string },
  session: { dayOfWeek: string; startTime: string; endDate: string },
  daysBefore: number
) {
  const eventType = `REMINDER_D${daysBefore}`;
  
  return sendByDbTemplate(eventType, {
    수강생명: student.name,
    코치명: coach.name,
    요일: session.dayOfWeek,
    시간: session.startTime,
    종료일: session.endDate,
  }, {
    STUDENT: student.phone,
  });
}

// ===== Tally 코칭신청서 =====
export async function sendTallyApplicationMessages(
  student: { name: string; phone: string },
  coach: { name: string; phone?: string }
) {
  return sendByDbTemplate('TALLY_APPLICATION', {
    수강생명: student.name,
    코치명: coach.name,
  }, {
    STUDENT: student.phone,
    COACH: coach.phone,
  });
}

// ===== Tally 사전진단 =====
export async function sendTallyDiagnosisMessages(
  student: { name: string; phone: string },
  coach: { name: string; phone?: string },
  openChatLink: string
) {
  return sendByDbTemplate('TALLY_DIAGNOSIS', {
    수강생명: student.name,
    코치명: coach.name,
    오픈톡링크: openChatLink,
  }, {
    STUDENT: student.phone,
    COACH: coach.phone,
  });
}

// ===== 슬롯 변경 =====
export async function sendSlotChangeMessages(
  student: { name: string; phone: string },
  coach: { name: string; phone?: string },
  oldSlot: { dayOfWeek: string; startTime: string },
  newSlot: { dayOfWeek: string; startTime: string }
) {
  return sendByDbTemplate('SLOT_CHANGE', {
    수강생명: student.name,
    코치명: coach.name,
    요일: newSlot.dayOfWeek,
    시간: newSlot.startTime,
    이전시간: `${oldSlot.dayOfWeek} ${oldSlot.startTime}`,
  }, {
    STUDENT: student.phone,
    COACH: coach.phone,
  });
}

// ===== 연장 권유 =====
export async function sendExtensionRecommendMessage(
  student: { name: string; phone: string },
  coach: { name: string },
  endDate: string
) {
  const results = await sendByDbTemplate('EXTENSION_RECOMMEND', {
    수강생명: student.name,
    코치명: coach.name,
    종료일: endDate,
  }, {
    STUDENT: student.phone,
  });
  return results[0]?.result || skippedResult('수강생');
}

// Re-export
export { sendSms, sendAdminSms, sendSmsBulk } from './solapi';
