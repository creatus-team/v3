// lib/constants.ts
// RCCC 시스템의 모든 상수 정의

// ===== 타임존 =====
export const TIMEZONE = 'Asia/Seoul';

// ===== 수강 기간 =====
export const LESSON_DURATION_WEEKS = 4;
export const LESSON_DURATION_DAYS = 28;

// ===== 세션(수강) 상태 =====
export const SESSION_STATUS = {
  PENDING: 'PENDING',              // 대기 (시작일 전)
  ACTIVE: 'ACTIVE',                // 수강중
  EXPIRED: 'EXPIRED',              // 종료 (정상 만료)
  CANCELLED: 'CANCELLED',          // 취소 (관리자 취소)
  REFUNDED: 'REFUNDED',            // 환불 (Latpeed 환불)
  EARLY_TERMINATED: 'EARLY_TERMINATED',  // 조기종료 (환불 등)
} as const;

export type SessionStatus = typeof SESSION_STATUS[keyof typeof SESSION_STATUS];

// ===== 결제 상태 (시트에서 들어오는 값) =====
export const PAYMENT_STATUS = {
  COMPLETED: '결제 완료',   // 정상 결제 (또는 빈 값)
  CANCELLED: '결제 취소',   // 환불/취소
} as const;

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

// ===== 코치 등급 =====
export const COACH_GRADE = {
  TRAINEE: 'TRAINEE',      // 견습
  REGULAR: 'REGULAR',      // 정식 (일반)
  SENIOR: 'SENIOR',        // 선임
} as const;

export type CoachGrade = typeof COACH_GRADE[keyof typeof COACH_GRADE];

// ===== 코치 등급별 정산 설정 =====
export const COACH_SETTLEMENT = {
  TRAINEE: { 
    packagePrice: 400000,       // 4회 패키지 40만원
    revenuePerSession: 100000,  // 1회당 매출: 10만원
    coachRatio: 0.4,            // 코치 40%, 회사 60%
    perSession: 40000,          // 1회당 코치 정산: 4만원
    companyPerSession: 60000,   // 1회당 회사 수익: 6만원
  },
  REGULAR: { 
    packagePrice: 400000,       // 4회 패키지 40만원
    revenuePerSession: 100000,  // 1회당 매출: 10만원
    coachRatio: 0.5,            // 코치 50%, 회사 50%
    perSession: 50000,          // 1회당 코치 정산: 5만원
    companyPerSession: 50000,   // 1회당 회사 수익: 5만원
  },
  SENIOR: { 
    packagePrice: 500000,       // 4회 패키지 50만원
    revenuePerSession: 125000,  // 1회당 매출: 12.5만원
    coachRatio: 0.6,            // 코치 60%, 회사 40%
    perSession: 75000,          // 1회당 코치 정산: 7.5만원
    companyPerSession: 50000,   // 1회당 회사 수익: 5만원
  },
} as const;

// ===== 활동 로그 타입 =====
export const ACTION_TYPE = {
  ENROLL: 'ENROLL',                    // 신규 등록
  RENEWAL: 'RENEWAL',                  // 재결제
  CANCEL: 'CANCEL',                    // 취소
  REFUND: 'REFUND',                    // 환불
  POSTPONE: 'POSTPONE',                // 수강 연기
  EARLY_TERMINATE: 'EARLY_TERMINATE',  // 조기종료 (환불로 인한)
  EDIT: 'EDIT',                        // 정보 수정
  SLOT_TIME_CHANGE: 'SLOT_TIME_CHANGE', // 슬롯 시간 변경
  USER_MERGE: 'USER_MERGE',            // 수강생 병합
} as const;

export type ActionType = typeof ACTION_TYPE[keyof typeof ACTION_TYPE];

// ===== 조기종료 사유 =====
export const EARLY_TERMINATION_REASON = {
  REFUND: 'REFUND',            // 환불
  OTHER: 'OTHER',              // 기타
} as const;

export type EarlyTerminationReason = typeof EARLY_TERMINATION_REASON[keyof typeof EARLY_TERMINATION_REASON];

// ===== 수동등록 사유 =====
export const MANUAL_ENTRY_REASON = {
  CASH_PAYMENT: 'CASH_PAYMENT',    // 현금/계좌이체
  FREE_TRIAL: 'FREE_TRIAL',        // 무료 체험
  TEST: 'TEST',                    // 테스트
  SYSTEM_RECOVERY: 'SYSTEM_RECOVERY',  // 시스템 오류 복구
  OTHER: 'OTHER',                  // 기타
} as const;

export type ManualEntryReason = typeof MANUAL_ENTRY_REASON[keyof typeof MANUAL_ENTRY_REASON];

// ===== 시스템 로그 이벤트 타입 =====
export const EVENT_TYPE = {
  WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',
  WEBHOOK_FAILED: 'WEBHOOK_FAILED',
  WEBHOOK_DUPLICATE: 'WEBHOOK_DUPLICATE',
  PARSE_SUCCESS: 'PARSE_SUCCESS',
  PARSE_FAILED: 'PARSE_FAILED',
  SMS_SENT: 'SMS_SENT',
  SMS_FAILED: 'SMS_FAILED',
  SMS_WARNING: 'SMS_WARNING',
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_CANCELLED: 'SESSION_CANCELLED',
  SESSION_REFUNDED: 'SESSION_REFUNDED',
  SESSION_POSTPONED: 'SESSION_POSTPONED',
  SLOT_CONFLICT: 'SLOT_CONFLICT',
  REFUND_AUTO_PROCESSED: 'REFUND_AUTO_PROCESSED',
  REFUND_MATCH_FAILED: 'REFUND_MATCH_FAILED',
  MANUAL_USER_CREATED: 'MANUAL_USER_CREATED',
  WEBHOOK_REPROCESSED: 'WEBHOOK_REPROCESSED',
  CRON_STARTED: 'CRON_STARTED',
  CRON_COMPLETED: 'CRON_COMPLETED',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
} as const;

export type EventType = typeof EVENT_TYPE[keyof typeof EVENT_TYPE];

// ===== 로그 처리 상태 =====
export const LOG_PROCESS_STATUS = {
  SUCCESS: 'SUCCESS',     // 자동 처리 성공
  PENDING: 'PENDING',     // 미처리 (확인/조치 필요)
  RESOLVED: 'RESOLVED',   // 처리 완료
  IGNORED: 'IGNORED',     // 무시됨
} as const;

export type LogProcessStatus = typeof LOG_PROCESS_STATUS[keyof typeof LOG_PROCESS_STATUS];

// ===== 인박스 상태 =====
export const INBOX_STATUS = {
  PENDING: 'PENDING',      // 미처리
  RESOLVED: 'RESOLVED',    // 처리 완료
  IGNORED: 'IGNORED',      // 무시
} as const;

export type InboxStatus = typeof INBOX_STATUS[keyof typeof INBOX_STATUS];

// ===== 인박스 에러 타입 =====
export const INBOX_ERROR_TYPE = {
  PARSE_FAILED: 'PARSE_FAILED',
  SLOT_CONFLICT: 'SLOT_CONFLICT',
  REFUND_MATCH_FAILED: 'REFUND_MATCH_FAILED',
  TALLY_MATCH_FAILED: 'TALLY_MATCH_FAILED',
} as const;

export type InboxErrorType = typeof INBOX_ERROR_TYPE[keyof typeof INBOX_ERROR_TYPE];

// ===== 요일 =====
export const DAY_OF_WEEK = {
  MON: '월',
  TUE: '화',
  WED: '수',
  THU: '목',
  FRI: '금',
  SAT: '토',
  SUN: '일',
} as const;

export type DayOfWeek = typeof DAY_OF_WEEK[keyof typeof DAY_OF_WEEK];

// ===== 요일 배열 (순서대로) =====
export const DAYS_ARRAY = ['월', '화', '수', '목', '금', '토', '일'] as const;

// ===== 요일 dayjs 인덱스 맵핑 =====
export const DAY_INDEX_MAP: Record<string, number> = {
  '일': 0,
  '월': 1,
  '화': 2,
  '수': 3,
  '목': 4,
  '금': 5,
  '토': 6,
};

// ===== 시트 타입 =====
export const SHEET_TYPE = {
  NEW_ENROLLMENT: 'NEW_ENROLLMENT',
  RENEWAL: 'RENEWAL',
} as const;

export type SheetType = typeof SHEET_TYPE[keyof typeof SHEET_TYPE];

// ===== API 설정 =====
export const API_CONFIG = {
  SMS_TIMEOUT_MS: 5000,  // 문자 발송 타임아웃 5초
} as const;

// ===== SMS 발송 설정은 DB에서 관리 =====
// 설정 조회: /api/settings/sms
// 설정 변경: 설정 페이지에서 토글

// ===== SMS 수신자 타입 =====
export const SMS_RECIPIENT_TYPE = {
  STUDENT: 'STUDENT',
  COACH: 'COACH',
  ADMIN: 'ADMIN',
} as const;

export type SmsRecipientType = typeof SMS_RECIPIENT_TYPE[keyof typeof SMS_RECIPIENT_TYPE];

// ===== SMS 발송 상태 =====
export const SMS_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export type SmsStatus = typeof SMS_STATUS[keyof typeof SMS_STATUS];

// ===== 리마인더 상태 =====
export const REMINDER_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export type ReminderStatus = typeof REMINDER_STATUS[keyof typeof REMINDER_STATUS];
