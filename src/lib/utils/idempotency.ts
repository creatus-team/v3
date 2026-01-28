// lib/utils/idempotency.ts
import { normalizePhone } from './phone-normalizer';

/**
 * 웹훅 중복 방지를 위한 멱등키를 생성합니다.
 * 전화번호 + 결제일시 조합
 */
export function generateIdempotencyKey(phone: string, paymentDateTime: string): string {
  const normalized = normalizePhone(phone);
  return `${normalized}_${paymentDateTime}`;
}

/**
 * SMS 중복 방지를 위한 멱등키를 생성합니다.
 * 전화번호 + 메시지타입 + 날짜
 */
export function generateSmsIdempotencyKey(
  phone: string, 
  messageType: string, 
  date: string
): string {
  const normalized = normalizePhone(phone);
  return `sms_${normalized}_${messageType}_${date}`;
}
