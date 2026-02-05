// types/index.ts
// RCCC 시스템의 모든 TypeScript 타입 정의

import {
  SessionStatus,
  CoachGrade,
  ActionType,
  EventType,
  LogProcessStatus,
  InboxStatus,
  InboxErrorType,
  DayOfWeek,
  SmsRecipientType,
  SmsStatus,
  ReminderStatus,
  ManualEntryReason,
  EarlyTerminationReason,
} from '@/lib/constants';

// ===== 수강생 =====
export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  memo?: string | null;
  is_manual_entry: boolean;
  manual_entry_reason?: ManualEntryReason | null;
  created_at: string;
  updated_at: string;
}

// ===== 코치 =====
export interface Coach {
  id: string;
  name: string;
  phone?: string | null;
  grade: CoachGrade;
  bank_account?: string | null;
  max_slots: number;
  created_at: string;
  updated_at: string;
}

// ===== 슬롯 =====
export interface CoachSlot {
  id: string;
  coach_id: string;
  day_of_week: DayOfWeek;
  start_time: string;  // "HH:mm:ss" 형식
  end_time?: string | null;
  open_chat_link?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // 조인 데이터
  coach?: Coach;
  current_session?: Session | null;
}

// ===== 세션 (수강 이력) =====
export interface Session {
  id: string;
  user_id: string;
  coach_id: string;
  slot_id?: string | null;
  day_of_week: DayOfWeek;
  start_time: string;
  start_date: string;  // "YYYY-MM-DD" 형식
  end_date: string;
  extension_count: number;
  status: SessionStatus;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  early_terminated_at?: string | null;
  early_termination_reason?: EarlyTerminationReason | null;
  payment_amount?: number | null;
  payment_date?: string | null;
  product_name?: string | null;
  created_at: string;
  updated_at: string;
  // 조인 데이터
  user?: User;
  coach?: Coach;
  slot?: CoachSlot;
  postponements?: Postponement[];
}

// ===== 연기 기록 =====
export interface Postponement {
  id: string;
  session_id: string;
  postponed_date: string;  // "YYYY-MM-DD" 형식
  reason?: string | null;
  created_at: string;
}

// ===== 활동 로그 =====
export interface UserActivityLog {
  id: string;
  user_id: string;
  session_id?: string | null;
  action_type: ActionType;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

// ===== 변경 이력 =====
export interface ChangeLog {
  id: string;
  table_name: string;
  record_id: string;
  field_name: string;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
}

// ===== 시스템 로그 =====
export interface SystemLog {
  id: string;
  event_type: EventType;
  status: string;
  message: string;
  error_detail?: string | null;
  raw_data?: Record<string, unknown> | null;
  retryable: boolean;
  retry_count: number;
  retry_payload?: Record<string, unknown> | null;
  process_status: LogProcessStatus;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_at: string;
}

// ===== 문자 발송 로그 =====
export interface SmsLog {
  id: string;
  recipient_phone: string;
  recipient_type: SmsRecipientType;
  message_content: string;
  status: SmsStatus;
  error_message?: string | null;
  provider_message_id?: string | null;
  retry_count: number;
  idempotency_key?: string | null;
  created_at: string;
}

// ===== 리마인더 로그 =====
export interface ReminderLog {
  id: string;
  session_id: string;
  remind_date: string;
  status: ReminderStatus;
  sent_at?: string | null;
  error_message?: string | null;
  created_at: string;
}

// ===== Raw 웹훅 데이터 =====
export interface RawWebhook {
  id: string;
  source: string;
  payload: Record<string, unknown>;
  idempotency_key?: string | null;
  processed: boolean;
  created_at: string;
}

// ===== 인박스 =====
export interface InboxItem {
  id: string;
  raw_webhook_id?: string | null;
  raw_text?: string | null;
  error_message?: string | null;
  error_type?: InboxErrorType | null;
  manual_resolution_status: InboxStatus;
  created_at: string;
  metadata?: {
    source?: string;
    formType?: string;
    name?: string;
    phone?: string;
    normalizedPhone?: string;
    userId?: string;
    payload?: unknown;
  } | null;
  // 조인 데이터
  raw_webhook?: RawWebhook;
}

// ===== 정산 확정 =====
export interface SettlementLock {
  id: string;
  year: number;
  month: number;
  locked_at: string;
  unlocked_at?: string | null;
}

// ===== 정산 데이터 (계산용) =====
export interface SettlementData {
  coach: Coach;
  sessions: {
    date: string;
    slotInfo: string;
    studentName: string;
    status: 'normal' | 'postponed' | 'refunded' | 'early_terminated';
  }[];
  totalSessions: number;
  revenue: number;
  coachPayment: number;
  companyProfit: number;
}

// ===== 월 요약 =====
export interface MonthlySummary {
  year: number;
  month: number;
  totalSessions: number;
  totalRevenue: number;
  totalCoachPayment: number;
  totalCompanyProfit: number;
  isLocked: boolean;
}

// ===== 대시보드 KPI =====
export interface DashboardKPI {
  emptySlots: number;
  inboxCount: number;
  activeStudents: number;
  endingSoon: number;  // D-7 이내
  systemErrors: number;
  // SMS 현황
  smsTodaySent: number;
  smsTodayFailed: number;
  smsTodayWarning: number;
}

// ===== 오늘의 수업 =====
export interface TodayLesson {
  time: string;
  coachName: string;
  studentName: string;
  studentPhone: string;
  slotId: string;
  sessionId: string;
}

// ===== 파싱된 구매옵션 =====
export interface ParsedOption {
  coach: string;
  day: DayOfWeek;
  time: string;  // "HH:mm" 형식
}

// ===== 웹훅 페이로드 =====
export interface SheetWebhookPayload {
  이름?: string;
  이메일?: string;
  전화번호?: string;
  구매옵션?: string;
  상태?: string;
  결제금액?: string | number;
  일시?: string;
  결제방식?: string;
  취소사유?: string;
  [key: string]: unknown;
}

// ===== API 응답 타입 =====
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ===== 필터/정렬 옵션 =====
export type StudentSortOption = 'endingSoon' | 'createdAt' | 'name' | 'coach';
export type StudentFilterOption = 'all' | 'active' | 'pending' | 'endingSoon' | 'expired' | 'refundedCancelled';
export type SlotFilterOption = 'all' | 'active' | 'endingSoon' | 'empty';
export type LogDateFilter = 'today' | 'yesterday' | 'week' | 'custom';
export type LogStatusFilter = 'all' | 'pending' | 'resolved';

// ===== 수강생 표시용 상태 =====
export type DisplayStudentStatus = 'active' | 'pending' | 'expired' | 'refunded' | 'cancelled' | 'early_terminated';

// ===== 수강생 with 계산된 상태 =====
export interface UserWithStatus extends User {
  displayStatus: DisplayStudentStatus;
  currentSession?: Session | null;
  sessions: Session[];
  dDay?: number | null;
  extensionCount: number;
  completedLessons: number;
  totalLessons: number;
}
