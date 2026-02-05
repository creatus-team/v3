// lib/sms/template-sender.ts
import { getServerClient } from '@/lib/supabase/server';
import { sendSms } from './index';

interface TemplateVariables {
  수강생명?: string;
  코치명?: string;
  요일?: string;
  시간?: string;
  이전시간?: string;
  시작일?: string;
  종료일?: string;
  연기날짜?: string;
  오픈톡링크?: string;
  취소사유?: string;
  원본데이터?: string;
  오류메시지?: string;
  회차?: string;
  수업목록?: string;
  총건수?: string;
}

interface SendResult {
  success: boolean;
  sent: string[];
  skipped: string[];
  errors: string[];
}

/**
 * DB 템플릿 기반으로 문자 발송
 * 
 * @param eventType - 이벤트 종류 (NEW_ENROLL, CANCEL 등)
 * @param variables - 치환할 변수들
 * @param recipients - 수신자 정보 { STUDENT?: phone, COACH?: phone, ADMIN?: phone }
 */
export async function sendByTemplate(
  eventType: string,
  variables: TemplateVariables,
  recipients: { STUDENT?: string; COACH?: string; ADMIN?: string }
): Promise<SendResult> {
  const supabase = getServerClient();
  const result: SendResult = {
    success: true,
    sent: [],
    skipped: [],
    errors: [],
  };

  // 해당 이벤트의 템플릿들 조회
  const { data: templates, error } = await supabase
    .from('sms_templates')
    .select('*')
    .eq('event_type', eventType)
    .eq('is_active', true);

  if (error || !templates) {
    result.success = false;
    result.errors.push('템플릿 조회 실패');
    return result;
  }

  // 각 템플릿별로 발송
  for (const template of templates) {
    const recipientType = template.recipient_type as 'STUDENT' | 'COACH' | 'ADMIN';
    const phone = recipients[recipientType];

    if (!phone) {
      result.skipped.push(`${recipientType}: 번호 없음`);
      continue;
    }

    // 변수 치환
    let content = template.content;
    for (const [key, value] of Object.entries(variables)) {
      if (value) {
        content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
    }

    // 발송
    try {
      await sendSms(phone, content);
      result.sent.push(recipientType);
    } catch (err) {
      result.errors.push(`${recipientType}: 발송 실패`);
    }
  }

  return result;
}

/**
 * 스케줄 기반 리마인더 템플릿 조회
 * 
 * @param daysBefore - 수업 N일 전
 */
export async function getScheduleTemplates(daysBefore: number) {
  const supabase = getServerClient();

  const { data: templates } = await supabase
    .from('sms_templates')
    .select('*')
    .eq('trigger_type', 'SCHEDULE')
    .eq('schedule_days_before', daysBefore)
    .eq('is_active', true);

  return templates || [];
}

/**
 * 변수 치환
 */
export function replaceVariables(content: string, variables: TemplateVariables): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    if (value) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
  }
  return result;
}
