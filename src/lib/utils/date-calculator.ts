// lib/utils/date-calculator.ts
import dayjs from '@/lib/dayjs';
import { DAY_INDEX_MAP, LESSON_DURATION_DAYS, DayOfWeek } from '@/lib/constants';

/**
 * 다양한 형식의 날짜 문자열을 파싱
 * 지원 형식:
 * - 25.12.16 10:39 (구글시트)
 * - 2025-12-16T10:39:00 (ISO)
 * - 2025-12-16 10:39:00
 * - 2025-12-16
 */
export function parseDateTime(dateStr: unknown): dayjs.Dayjs {
  if (!dateStr) {
    return dayjs();
  }
  
  // Date 객체인 경우
  if (dateStr instanceof Date) {
    return dayjs(dateStr);
  }
  
  const str = String(dateStr).trim();
  
  // 이미 ISO 형식이면 그대로 파싱
  if (str.includes('T') || str.match(/^\d{4}-\d{2}-\d{2}/)) {
    return dayjs(str);
  }
  
  // 구글시트 형식: 25.12.16 10:39 또는 26.01.14 18:01
  const sheetMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/);
  if (sheetMatch) {
    const [, yy, mm, dd, hh, min] = sheetMatch;
    // 20XX년으로 변환
    const year = parseInt(yy) < 50 ? `20${yy}` : `19${yy}`;
    return dayjs(`${year}-${mm}-${dd}T${hh}:${min}:00`);
  }
  
  // 기타 형식 시도
  const parsed = dayjs(str);
  if (parsed.isValid()) {
    return parsed;
  }
  
  // 파싱 실패시 현재 시간 반환
  console.warn('날짜 파싱 실패:', str);
  return dayjs();
}

/**
 * 날짜를 ISO 형식으로 변환
 */
export function toISOString(dateStr: unknown): string {
  return parseDateTime(dateStr).toISOString();
}

/**
 * 날짜를 YYYY-MM-DD 형식으로 변환
 */
export function toDateString(dateStr: unknown): string {
  return parseDateTime(dateStr).format('YYYY-MM-DD');
}

/**
 * 신규 등록 시 시작일 계산
 * 규칙: 결제일 기준 "달력상 다음 주의 해당 요일" (한국 기준 월~일)
 * 예: 금요일 결제 + 월요일 수업 → 바로 다음 월요일 (2일 뒤)
 * 예: 수요일 결제 + 일요일 수업 → 다음 주 일요일 (11일 뒤, 같은 주 일요일이 아님)
 * @param dayOfWeek 수업 요일
 * @param baseDate 기준일 (결제일) - 없으면 오늘
 */
export function calculateStartDate(dayOfWeek: DayOfWeek, baseDate?: string | Date | unknown): string {
  const base = baseDate ? parseDateTime(baseDate) : dayjs();
  const targetDayIndex = DAY_INDEX_MAP[dayOfWeek]; // 일=0, 월=1, ... 토=6
  const baseDayIndex = base.day(); // 일=0, 월=1, ... 토=6
  
  // 1) 다음 주 월요일까지의 일수 (한국 기준 주 = 월~일)
  const daysToNextMonday = baseDayIndex === 0 ? 1 : (8 - baseDayIndex);
  
  // 2) 다음 주 월요일에서 해당 요일까지의 오프셋 (월=0, 화=1, ... 일=6)
  const dayOffset = targetDayIndex === 0 ? 6 : (targetDayIndex - 1);
  
  return base.add(daysToNextMonday + dayOffset, 'day').format('YYYY-MM-DD');
}

/**
 * 종료일 계산
 * 규칙: 시작일 + (4주 - 1일) = 시작일 + 27일
 */
export function calculateEndDate(startDate: string): string {
  return dayjs(startDate).add(LESSON_DURATION_DAYS - 1, 'day').format('YYYY-MM-DD');
}

/**
 * 마지막 수업일 계산 (UI 표시용)
 * 규칙: end_date - 6일 (= start_date + 21일 = 시작일과 같은 요일)
 */
export function getLastLessonDate(endDate: string): string {
  return dayjs(endDate).subtract(6, 'day').format('YYYY-MM-DD');
}

/**
 * 재결제(연장) 시 시작일 계산
 * 규칙: 기존 종료일 다음날
 */
export function calculateRenewalStartDate(currentEndDate: string): string {
  return dayjs(currentEndDate).add(1, 'day').format('YYYY-MM-DD');
}

/**
 * 연기 시 새 종료일 계산
 * 규칙: 기존 종료일 + (연기 주 수 * 7)
 */
export function calculatePostponedEndDate(currentEndDate: string, weeks: number): string {
  return dayjs(currentEndDate).add(weeks * 7, 'day').format('YYYY-MM-DD');
}

/**
 * D-Day 계산 (종료일까지 남은 일수)
 * 양수: 남은 일수
 * 0: 오늘
 * 음수: 지난 일수
 */
export function calculateDDay(endDate: string): number {
  const today = dayjs().startOf('day');
  const end = dayjs(endDate).startOf('day');
  return end.diff(today, 'day');
}

/**
 * 오늘 날짜 (KST)
 */
export function getToday(): string {
  return dayjs().format('YYYY-MM-DD');
}

/**
 * 내일 날짜 (KST)
 */
export function getTomorrow(): string {
  return dayjs().add(1, 'day').format('YYYY-MM-DD');
}

/**
 * 어제 날짜 (KST)
 */
export function getYesterday(): string {
  return dayjs().subtract(1, 'day').format('YYYY-MM-DD');
}

/**
 * 특정 날짜가 해당 월에 속하는지 확인
 */
export function isDateInMonth(date: string, year: number, month: number): boolean {
  const d = dayjs(date);
  return d.year() === year && d.month() + 1 === month;
}

/**
 * 해당 월의 특정 요일에 해당하는 모든 날짜 반환
 */
export function getDatesInMonthByDayOfWeek(
  year: number,
  month: number,
  dayOfWeek: DayOfWeek
): string[] {
  const dates: string[] = [];
  const targetDayIndex = DAY_INDEX_MAP[dayOfWeek];
  
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const daysInMonth = start.daysInMonth();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = start.date(day);
    if (date.day() === targetDayIndex) {
      dates.push(date.format('YYYY-MM-DD'));
    }
  }
  
  return dates;
}

/**
 * 세션 기간 중 해당 월에 해당하는 수업 날짜들 반환
 */
export function getSessionDatesInMonth(
  startDate: string,
  endDate: string,
  dayOfWeek: DayOfWeek,
  year: number,
  month: number,
  postponedDates: string[] = [],
  earlyTerminatedAt?: string | null
): { date: string; isPostponed: boolean; isExcluded: boolean }[] {
  const results: { date: string; isPostponed: boolean; isExcluded: boolean }[] = [];
  const monthDates = getDatesInMonthByDayOfWeek(year, month, dayOfWeek);
  
  for (const date of monthDates) {
    // 세션 기간 내인지 확인
    if (date < startDate || date > endDate) {
      continue;
    }
    
    // 조기종료일 이후인지 확인
    const isAfterEarlyTermination = earlyTerminatedAt && date > earlyTerminatedAt;
    
    // 연기된 날짜인지 확인
    const isPostponed = postponedDates.includes(date);
    
    results.push({
      date,
      isPostponed,
      isExcluded: isPostponed || !!isAfterEarlyTermination,
    });
  }
  
  return results;
}

/**
 * 날짜를 표시용 포맷으로 변환
 */
export function formatDate(date: string, format = 'YYYY-MM-DD'): string {
  return dayjs(date).format(format);
}

/**
 * 날짜를 한글 표시용 포맷으로 변환
 */
export function formatDateKorean(date: string): string {
  return dayjs(date).format('M월 D일 (ddd)');
}

/**
 * 현재 시간 (KST)
 */
export function getNow(): dayjs.Dayjs {
  return dayjs();
}

/**
 * ISO 형식 타임스탬프 반환
 */
export function getISOTimestamp(): string {
  return dayjs().toISOString();
}
