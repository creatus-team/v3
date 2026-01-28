// lib/utils/option-parser.ts
import { DAYS_ARRAY, DayOfWeek } from '@/lib/constants';
import type { ParsedOption } from '@/types';

/**
 * 구매옵션 텍스트를 파싱합니다.
 * 
 * 입력 예시:
 * - "김다혜 / 화요일 / 19:00 ~ 19:40"
 * - "김다혜/화/19:00~19:40"
 * - "김민지 / 금요일 / 15:00 ~ 15:40"
 * 
 * @returns 파싱된 옵션 또는 null (파싱 실패 시)
 */
export function parseOption(optionText: string): ParsedOption | null {
  if (!optionText || typeof optionText !== 'string') {
    return null;
  }

  try {
    // 1. 구분자로 분리 (/, 띄어쓰기 조합)
    const parts = optionText
      .split(/[\/]/)
      .map(part => part.trim())
      .filter(part => part.length > 0);

    if (parts.length < 3) {
      console.error('파싱 실패: 구분자로 분리된 부분이 3개 미만', { optionText, parts });
      return null;
    }

    // 2. 코치 이름 (첫 번째 부분)
    const coach = parts[0].trim();
    if (!coach) {
      console.error('파싱 실패: 코치 이름 없음', { optionText });
      return null;
    }

    // 3. 요일 추출 (두 번째 부분)
    const dayPart = parts[1].trim();
    const day = extractDay(dayPart);
    if (!day) {
      console.error('파싱 실패: 요일 추출 실패', { optionText, dayPart });
      return null;
    }

    // 4. 시간 추출 (세 번째 부분)
    const timePart = parts[2].trim();
    const time = extractTime(timePart);
    if (!time) {
      console.error('파싱 실패: 시간 추출 실패', { optionText, timePart });
      return null;
    }

    return {
      coach,
      day,
      time,
    };
  } catch (error) {
    console.error('파싱 중 에러 발생', { optionText, error });
    return null;
  }
}

/**
 * 요일 텍스트에서 요일 추출
 * "화요일", "화", "TUE" 등 지원
 */
function extractDay(text: string): DayOfWeek | null {
  const normalized = text.trim();
  
  // 직접 매칭 (월, 화, 수...)
  for (const day of DAYS_ARRAY) {
    if (normalized.includes(day)) {
      return day as DayOfWeek;
    }
  }

  // "요일" 붙은 경우 (월요일, 화요일...)
  const dayMatch = normalized.match(/([월화수목금토일])요일?/);
  if (dayMatch) {
    return dayMatch[1] as DayOfWeek;
  }

  return null;
}

/**
 * 시간 텍스트에서 시작 시간 추출
 * "19:00 ~ 19:40", "19:00~19:40", "19:00", "19시" 등 지원
 */
function extractTime(text: string): string | null {
  const normalized = text.trim();

  // HH:MM 형식 매칭
  const timeMatch = normalized.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hour = timeMatch[1].padStart(2, '0');
    const minute = timeMatch[2];
    return `${hour}:${minute}`;
  }

  // HH시 형식 매칭 (예: "19시" → "19:00")
  const hourMatch = normalized.match(/(\d{1,2})시/);
  if (hourMatch) {
    const hour = hourMatch[1].padStart(2, '0');
    return `${hour}:00`;
  }

  return null;
}

/**
 * 시간 문자열 유효성 검사
 */
export function isValidTime(time: string): boolean {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

/**
 * 종료 시간 계산 (시작 시간 + 40분)
 */
export function calculateEndTime(startTime: string): string {
  const [hour, minute] = startTime.split(':').map(Number);
  let endMinute = minute + 40;
  let endHour = hour;
  
  if (endMinute >= 60) {
    endMinute -= 60;
    endHour += 1;
  }
  
  if (endHour >= 24) {
    endHour -= 24;
  }
  
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}
