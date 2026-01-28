// lib/utils/phone-normalizer.ts

/**
 * 전화번호를 정규화합니다.
 * 
 * 입력 예시:
 * - '010-1234-5678'    → '01012345678'
 * - '010 1234 5678'    → '01012345678'
 * - '010.1234.5678'    → '01012345678'
 * - '+82 10-1234-5678' → '01012345678'
 * - '+821012345678'    → '01012345678'
 * - '82-10-1234-5678'  → '01012345678'
 * - '8201012345678'    → '01012345678'
 * - '1012345678'       → '01012345678'
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  
  // 1. 숫자만 남기기 (하이픈, 공백, 점, 괄호, +기호 등 모두 제거)
  let digits = phone.replace(/\D/g, '');
  
  // 2. 국제번호 처리 (82로 시작하면 제거)
  if (digits.startsWith('82')) {
    const afterCountryCode = digits.slice(2);
    // 82 뒤가 이미 0으로 시작하면 그대로, 아니면 0 붙이기
    digits = afterCountryCode.startsWith('0') ? afterCountryCode : '0' + afterCountryCode;
  }
  
  // 3. 0으로 시작 안 하고 10자리면 0 붙이기 (예: 1012345678 → 01012345678)
  if (digits.length === 10 && !digits.startsWith('0')) {
    digits = '0' + digits;
  }
  
  // 4. 너무 긴 경우 뒤에서 11자리만 추출
  if (digits.length > 11) {
    digits = digits.slice(-11);
  }
  
  return digits;
}

/**
 * 전화번호가 유효한지 검증합니다.
 */
export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  // 010, 011, 016, 017, 018, 019로 시작하는 10~11자리
  return /^01[0-9]{8,9}$/.test(normalized);
}

/**
 * 전화번호를 표시용 형식으로 변환합니다.
 * 예: '01012345678' → '010-1234-5678'
 */
export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length === 11) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 7)}-${normalized.slice(7)}`;
  } else if (normalized.length === 10) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }
  return phone;
}
