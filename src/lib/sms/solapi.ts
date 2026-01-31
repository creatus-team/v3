// lib/sms/solapi.ts
import crypto from 'crypto';
import { getServerClient } from '@/lib/supabase/server';

const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY || '';
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET || '';
const SOLAPI_SENDER_NUMBER = process.env.SOLAPI_SENDER_NUMBER || '';
const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER || '';

const SOLAPI_URL = 'https://api.solapi.com/messages/v4/send';

interface SmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

type RecipientType = 'STUDENT' | 'COACH' | 'ADMIN';

// HMAC-SHA256 서명 생성
function generateSignature(date: string, salt: string, secret: string): string {
  const data = date + salt;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

// 랜덤 salt 생성
function generateSalt(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

// sms_logs에 저장
async function logSmsToDb(
  phone: string,
  text: string,
  recipientType: RecipientType,
  status: 'SENT' | 'FAILED',
  messageId?: string,
  errorMessage?: string
) {
  try {
    const supabase = getServerClient();
    await supabase.from('sms_logs').insert({
      recipient_phone: phone,
      recipient_type: recipientType,
      message_content: text,
      status: status,
      provider_message_id: messageId || null,
      error_message: errorMessage || null,
    });
  } catch (err) {
    console.error('sms_logs 저장 실패:', err);
  }
}

// SMS 발송
export async function sendSms(
  to: string, 
  text: string,
  recipientType: RecipientType = 'ADMIN'
): Promise<SmsResponse> {
  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SOLAPI_SENDER_NUMBER) {
    console.error('Solapi 환경변수가 설정되지 않았습니다.');
    await logSmsToDb(to, text, recipientType, 'FAILED', undefined, 'Solapi 환경변수 미설정');
    return { success: false, error: 'Solapi 환경변수 미설정' };
  }

  // 전화번호 정규화 (하이픈 제거)
  const normalizedTo = to.replace(/-/g, '');

  const date = new Date().toISOString();
  const salt = generateSalt();
  const signature = generateSignature(date, salt, SOLAPI_API_SECRET);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
  };

  const body = {
    message: {
      to: normalizedTo,
      from: SOLAPI_SENDER_NUMBER,
      text: text,
    },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

    const response = await fetch(SOLAPI_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json();

    if (response.ok && result.groupId) {
      console.log(`SMS 발송 성공: ${normalizedTo}`);
      await logSmsToDb(normalizedTo, text, recipientType, 'SENT', result.groupId);
      return { 
        success: true, 
        messageId: result.groupId,
      };
    } else {
      const errorMsg = result.errorMessage || result.message || 'Unknown error';
      console.error('SMS 발송 실패:', result);
      await logSmsToDb(normalizedTo, text, recipientType, 'FAILED', undefined, errorMsg);
      return { 
        success: false, 
        error: errorMsg,
      };
    }
  } catch (error) {
    let errorMsg = String(error);
    if (error instanceof Error && error.name === 'AbortError') {
      errorMsg = '타임아웃 (5초)';
      console.error('SMS 발송 타임아웃');
    } else {
      console.error('SMS 발송 오류:', error);
    }
    await logSmsToDb(normalizedTo, text, recipientType, 'FAILED', undefined, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// 관리자에게 SMS 발송
export async function sendAdminSms(text: string): Promise<SmsResponse> {
  if (!ADMIN_PHONE_NUMBER) {
    console.error('관리자 전화번호가 설정되지 않았습니다.');
    return { success: false, error: '관리자 전화번호 미설정' };
  }
  return sendSms(ADMIN_PHONE_NUMBER, text, 'ADMIN');
}

// 여러 명에게 SMS 발송
export async function sendSmsBulk(
  recipients: Array<{ phone: string; message: string; recipientType?: RecipientType }>
): Promise<Array<SmsResponse & { phone: string }>> {
  const results = await Promise.all(
    recipients.map(async (r) => {
      const result = await sendSms(r.phone, r.message, r.recipientType || 'ADMIN');
      return { ...result, phone: r.phone };
    })
  );
  return results;
}

// ==========================================
// 발송 상태 조회
// ==========================================

interface MessageStatus {
  messageId: string;
  status: 'PENDING' | 'SENDING' | 'COMPLETE' | 'FAILED';
  statusMessage?: string;
}

// 그룹 ID로 메시지 상태 조회
export async function getMessageStatus(groupId: string): Promise<MessageStatus | null> {
  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET) {
    console.error('Solapi 환경변수가 설정되지 않았습니다.');
    return null;
  }

  const date = new Date().toISOString();
  const salt = generateSalt();
  const signature = generateSignature(date, salt, SOLAPI_API_SECRET);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
  };

  try {
    // 그룹 내 메시지 목록 조회
    const response = await fetch(
      `https://api.solapi.com/messages/v4/groups/${groupId}/messages`,
      { method: 'GET', headers }
    );

    if (!response.ok) {
      console.error('Solapi 상태 조회 실패:', response.status);
      return null;
    }

    const result = await response.json();
    
    // messageList에서 첫 번째 메시지의 상태 확인
    if (result.messageList && Object.keys(result.messageList).length > 0) {
      const firstMessageId = Object.keys(result.messageList)[0];
      const message = result.messageList[firstMessageId];
      
      // Solapi 상태 매핑
      // PENDING, SENDING, COMPLETE, FAILED 등
      let status: MessageStatus['status'] = 'PENDING';
      
      if (message.statusCode === '4000') {
        status = 'COMPLETE';  // 발송 성공
      } else if (message.statusCode === '2000' || message.statusCode === '3000') {
        status = 'SENDING';   // 발송 중
      } else if (message.statusCode?.startsWith('5') || message.statusCode?.startsWith('6')) {
        status = 'FAILED';    // 실패
      }

      return {
        messageId: firstMessageId,
        status,
        statusMessage: message.statusMessage || message.reason || '',
      };
    }

    return null;
  } catch (error) {
    console.error('Solapi 상태 조회 오류:', error);
    return null;
  }
}

// sms_logs 상태 일괄 업데이트
export async function refreshSmsLogStatuses(logs: Array<{ id: string; provider_message_id: string }>) {
  const supabase = getServerClient();
  const results: Array<{ id: string; newStatus: string; statusMessage?: string }> = [];

  for (const log of logs) {
    if (!log.provider_message_id) continue;

    const status = await getMessageStatus(log.provider_message_id);
    
    if (status) {
      // DB 업데이트
      const newStatus = status.status === 'COMPLETE' ? 'DELIVERED' 
                      : status.status === 'FAILED' ? 'FAILED' 
                      : 'SENT';
      
      await supabase
        .from('sms_logs')
        .update({ 
          status: newStatus,
          error_message: status.status === 'FAILED' ? status.statusMessage : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', log.id);

      results.push({ 
        id: log.id, 
        newStatus,
        statusMessage: status.statusMessage,
      });
    }
  }

  return results;
}
