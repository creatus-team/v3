-- =====================================================
-- RCCC Database Schema for Supabase
-- v3.13
-- =====================================================

-- =====================================================
-- 수강생 (users)
-- =====================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  memo TEXT,
  is_manual_entry BOOLEAN DEFAULT FALSE,
  manual_entry_reason TEXT CHECK (manual_entry_reason IN ('CASH_PAYMENT', 'FREE_TRIAL', 'TEST', 'SYSTEM_RECOVERY', 'OTHER')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 코치 (coaches)
-- =====================================================
CREATE TABLE coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  grade TEXT DEFAULT 'REGULAR' 
    CHECK (grade IN ('TRAINEE', 'REGULAR', 'SENIOR')),
  bank_account TEXT,
  max_slots INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 슬롯 (coach_slots)
-- =====================================================
CREATE TABLE coach_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL 
    CHECK (day_of_week IN ('월', '화', '수', '목', '금', '토', '일')),
  start_time TIME NOT NULL,
  end_time TIME,
  open_chat_link TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coach_id, day_of_week, start_time)
);

-- =====================================================
-- 수강 이력 (sessions)
-- =====================================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  slot_id UUID REFERENCES coach_slots(id) ON DELETE SET NULL,
  day_of_week TEXT NOT NULL 
    CHECK (day_of_week IN ('월', '화', '수', '목', '금', '토', '일')),
  start_time TIME NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  extension_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' 
    CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'EARLY_TERMINATED')),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  early_terminated_at DATE,
  early_termination_reason TEXT 
    CHECK (early_termination_reason IN ('REFUND', 'OTHER')),
  payment_amount INTEGER,
  payment_date DATE,
  product_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 연기 기록 (postponements)
-- =====================================================
CREATE TABLE postponements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  postponed_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 활동 로그 (user_activity_logs)
-- =====================================================
CREATE TABLE user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL 
    CHECK (action_type IN ('ENROLL', 'RENEWAL', 'CANCEL', 'REFUND', 'POSTPONE', 'EARLY_TERMINATE', 'EDIT', 'SLOT_TIME_CHANGE', 'USER_MERGE')),
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 변경 이력 (change_logs)
-- =====================================================
CREATE TABLE change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 시스템 로그 (system_logs)
-- =====================================================
CREATE TABLE system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  message TEXT NOT NULL,
  error_detail TEXT,
  raw_data JSONB,
  retryable BOOLEAN DEFAULT FALSE,
  retry_count INTEGER DEFAULT 0,
  retry_payload JSONB,
  process_status TEXT DEFAULT 'SUCCESS'
    CHECK (process_status IN ('SUCCESS', 'PENDING', 'RESOLVED', 'IGNORED')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 문자 발송 로그 (sms_logs)
-- =====================================================
CREATE TABLE sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_phone TEXT NOT NULL,
  recipient_type TEXT NOT NULL 
    CHECK (recipient_type IN ('STUDENT', 'COACH', 'ADMIN')),
  message_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'FAILED')),
  error_message TEXT,
  provider_message_id TEXT,
  retry_count INTEGER DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 리마인더 로그 (reminder_logs)
-- =====================================================
CREATE TABLE reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  remind_date DATE NOT NULL,
  reminder_type TEXT DEFAULT 'D1',  -- D1, D2 등
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, remind_date, reminder_type)
);

-- =====================================================
-- Raw 데이터 (raw_webhooks)
-- =====================================================
CREATE TABLE raw_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  idempotency_key TEXT UNIQUE,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 인박스 (ingestion_inbox)
-- =====================================================
CREATE TABLE ingestion_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_webhook_id UUID REFERENCES raw_webhooks(id) ON DELETE SET NULL,
  raw_text TEXT,
  error_message TEXT,
  error_type TEXT CHECK (error_type IN ('PARSE_FAILED', 'SLOT_CONFLICT', 'REFUND_MATCH_FAILED')),
  manual_resolution_status TEXT DEFAULT 'PENDING'
    CHECK (manual_resolution_status IN ('PENDING', 'RESOLVED', 'IGNORED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 정산 확정 (settlement_locks)
-- =====================================================
CREATE TABLE settlement_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  unlocked_at TIMESTAMPTZ,
  UNIQUE(year, month)
);

-- =====================================================
-- 인덱스 (성능 최적화)
-- =====================================================
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_end_date ON sessions(end_date);
CREATE INDEX idx_sessions_start_date ON sessions(start_date);
CREATE INDEX idx_sessions_coach_id ON sessions(coach_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX idx_system_logs_event_type ON system_logs(event_type);
CREATE INDEX idx_system_logs_process_status ON system_logs(process_status);
CREATE INDEX idx_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX idx_inbox_status ON ingestion_inbox(manual_resolution_status);
CREATE INDEX idx_reminder_logs_date ON reminder_logs(remind_date);
CREATE INDEX idx_postponements_session ON postponements(session_id);
CREATE INDEX idx_postponements_date ON postponements(postponed_date);
CREATE INDEX idx_settlement_locks ON settlement_locks(year, month);
CREATE INDEX idx_raw_webhooks_idempotency ON raw_webhooks(idempotency_key);
CREATE INDEX idx_coach_slots_coach ON coach_slots(coach_id);
CREATE INDEX idx_coach_slots_active ON coach_slots(is_active);

-- =====================================================
-- updated_at 자동 업데이트 트리거
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coaches_updated_at
    BEFORE UPDATE ON coaches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coach_slots_updated_at
    BEFORE UPDATE ON coach_slots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Realtime 활성화 (Supabase Dashboard에서 설정 권장)
-- =====================================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE system_logs;
-- ALTER PUBLICATION supabase_realtime ADD TABLE ingestion_inbox;

-- =====================================================
-- 문자 템플릿 (sms_templates)
-- =====================================================
CREATE TABLE sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 템플릿 식별
  event_type TEXT NOT NULL,  -- 이벤트 종류 (NEW_ENROLL, RENEWAL, CANCEL 등)
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('STUDENT', 'COACH', 'ADMIN')),
  
  -- 템플릿 내용
  name TEXT NOT NULL,  -- 표시 이름 (예: "신규 등록 - 수강생")
  content TEXT NOT NULL,  -- 문자 내용 (변수 포함)
  
  -- 발송 설정
  is_active BOOLEAN DEFAULT TRUE,  -- ON/OFF
  trigger_type TEXT NOT NULL DEFAULT 'EVENT' CHECK (trigger_type IN ('EVENT', 'SCHEDULE', 'MANUAL')),
  
  -- 스케줄 설정 (trigger_type = 'SCHEDULE'인 경우)
  schedule_days_before INTEGER,  -- 수업 N일 전
  schedule_time TIME,  -- 발송 시간 (예: 18:00)
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(event_type, recipient_type)
);

-- 기본 템플릿 데이터
INSERT INTO sms_templates (event_type, recipient_type, name, content, trigger_type) VALUES
-- 신규 등록
('NEW_ENROLL', 'STUDENT', '신규 등록 - 수강생', '[크리투스 코칭] 수강 등록이 완료되었습니다.
담당 코치: {코치명}
수업 시간: {요일}요일 {시간}
시작일: {시작일}

본격적인 코칭 시작을 위해, 
아래 [필수 사전 설문]을 지금 바로 작성해주세요. 

필수 사전 진단 제출이 확인 되어야만 1:1 오픈채팅방 입장링크가 전달됩니다.
가능한 "오늘" 바로 작성해주세요!
https://tally.so/r/44agLB', 'EVENT'),

('NEW_ENROLL', 'COACH', '신규 등록 - 코치', '[크리투스 코칭] 수강생 등록이 완료되었습니다.
담당 코치: {코치명}
수업 시간: {요일}요일 {시간}
시작일: {시작일}', 'EVENT'),

('NEW_ENROLL', 'ADMIN', '신규 등록 - 관리자', '[크리투스 코칭] 수강생 등록이 완료되었습니다.
담당 코치: {코치명}
수업 시간: {요일}요일 {시간}
시작일: {시작일}', 'EVENT'),

-- 재결제 (연장)
('RENEWAL', 'STUDENT', '연장 - 수강생', '[크리투스 코칭] {수강생명}님

수강 연장이 완료되었습니다.

▶ 코치: {코치명} 코치
▶ 시간: {요일}요일 {시간}
▶ 연장 기간: {시작일} ~ {종료일}

감사합니다!', 'EVENT'),

('RENEWAL', 'COACH', '연장 - 코치', '[크리투스 코칭] {코치명} 코치님

{수강생명} 수강생이 연장 결제했습니다.

▶ 연장 기간: {시작일} ~ {종료일}

감사합니다!', 'EVENT'),

-- 수강 취소
('CANCEL', 'STUDENT', '취소 - 수강생', '[크리투스 코칭] {수강생명}님

수강이 취소 처리되었습니다.

문의사항은 크리투스 채널톡으로 연락주세요.', 'EVENT'),

('CANCEL', 'COACH', '취소 - 코치', '[크리투스 코칭] {코치명} 코치님

{수강생명} 수강생의 수업이 취소되었습니다.

▶ 슬롯: {요일}요일 {시간}

해당 슬롯이 비워집니다.', 'EVENT'),

('CANCEL', 'ADMIN', '취소 - 관리자', '[크리투스 코칭] 수강 취소
{수강생명} ({코치명}/{요일}/{시간})
사유: {취소사유}', 'EVENT'),

-- 수강 연기
('POSTPONE', 'STUDENT', '연기 - 수강생', '[크리투스 코칭] {수강생명}님

수업 연기가 처리되었습니다.

▶ 연기 날짜: {연기날짜}
▶ 변경된 종료일: {종료일}

문의사항은 크리투스 채널톡으로 연락주세요!', 'EVENT'),

('POSTPONE', 'COACH', '연기 - 코치', '[크리투스 코칭] {코치명} 코치님

{수강생명} 수강생의 수업이 연기되었습니다.

▶ 연기 날짜: {연기날짜}
▶ 슬롯: {요일}요일 {시간}', 'EVENT'),

-- 슬롯 시간 변경
('SLOT_TIME_CHANGE', 'STUDENT', '시간변경 - 수강생', '[크리투스 코칭] {수강생명}님

수업 시간이 변경되었습니다.

▶ 변경 전: {요일}요일 {이전시간}
▶ 변경 후: {요일}요일 {시간}

문의사항은 크리투스 채널톡으로 연락주세요!', 'EVENT'),

('SLOT_TIME_CHANGE', 'COACH', '시간변경 - 코치', '[크리투스 코칭] {코치명} 코치님

슬롯 시간이 변경되었습니다.

▶ 수강생: {수강생명}
▶ 변경 전: {요일}요일 {이전시간}
▶ 변경 후: {요일}요일 {시간}', 'EVENT'),

-- 환불
('REFUND', 'ADMIN', '환불 - 관리자', '[크리투스 코칭] 환불 처리 완료
{수강생명} ({코치명}/{요일}/{시간})
사유: {취소사유}', 'EVENT'),

('REFUND_MATCH_FAILED', 'ADMIN', '환불매칭실패 - 관리자', '[크리투스 코칭] 환불 매칭 실패
인박스를 확인해주세요.
{원본데이터}', 'EVENT'),

-- 슬롯 충돌
('SLOT_CONFLICT', 'ADMIN', '슬롯충돌 - 관리자', '[크리투스 코칭] 슬롯 충돌 발생
{수강생명} → {코치명}/{요일}/{시간}
인박스를 확인해주세요.', 'EVENT'),

-- Tally 설문 - 코칭신청서
('TALLY_APPLICATION', 'STUDENT', 'Tally 코칭신청서 - 수강생', '[크리투스 코칭] {수강생명}님
코칭 신청서가 정상적으로 제출되었습니다!', 'EVENT'),

('TALLY_APPLICATION', 'COACH', 'Tally 코칭신청서 - 코치', '{수강생명}님이 이번 주 코칭신청서를 제출했습니다.
DB에서 확인 후 해당 페이지 아래에 이어서 코칭 기획서를 작성해주세요!
https://loat.notion.site/DB-2c434088a27d80a9b159cde35db969cf?source=copy_link', 'EVENT'),

-- Tally 설문 - 사전진단
('TALLY_DIAGNOSIS', 'STUDENT', 'Tally 사전진단 - 수강생', '[크리투스 코칭] {수강생명}님

사전 진단 설문을 제출해주셔서 감사합니다!

아래 링크로 오픈카톡방에 입장해주세요.
{오픈톡링크}

코치님께 전달되었습니다.
첫 수업에서 만나요!', 'EVENT'),

('TALLY_DIAGNOSIS', 'COACH', 'Tally 사전진단 - 코치', '{수강생명}님이 사전진단 설문을 제출했습니다.
DB에서 확인 후 첫 사전진단 코칭을 준비해주세요!
https://loat.notion.site/DB-2c434088a27d80568330d8f88ee00c57?source=copy_link', 'EVENT'),

-- 리마인더 D-2 (수강생)
('REMINDER_D2', 'STUDENT', '리마인더 D-2 - 수강생', '[크리투스 코칭] 
{수강생명}님, 모레 {요일}요일 {시간}에
{코치명} 코치와 수업이 있습니다.

코칭신청서 제출도 잊지 마세요!
https://tally.so/r/81qKPr', 'SCHEDULE', 2, '18:00'),

-- 리마인더 D-1 (수강생)
('REMINDER_D1', 'STUDENT', '리마인더 D-1 - 수강생', '[크리투스 코칭] 
{수강생명}님, 내일 {요일}요일 {시간}에
{코치명} 코치와 수업이 있습니다.

코칭신청서 제출도 완료하셨나요?
https://tally.so/r/81qKPr', 'SCHEDULE', 1, '18:00'),

-- 코치 브리핑 D-1 (코치별 합산)
('COACH_BRIEFING', 'COACH', '코치 브리핑 D-1', '[크리투스 코칭] {코치명} 코치님

내일 수업 안내드립니다. (총 {총건수}건)

{수업목록}

잘 부탁드립니다!', 'SCHEDULE', 1, '18:00'),

-- 연장 권유
('EXTENSION_RECOMMEND', 'STUDENT', '연장 권유 - 수강생', '[크리투스 코칭] {수강생명}님
{코치명} 코치와의 수업이 {종료일}에 종료 예정입니다.
연장을 원하시면 미리 연장신청이 가능합니다!

아래 링크에서 이번 코칭에 대한 후기를 남겨주시면
자동으로 연장결제 링크가 제공됩니다!
https://www.latpeed.com/products/7ScV3

수업종료일까지 연장 신청이 없을경우 자동으로 해당 시간대가 다른 분들께 오픈됩니다.', 'MANUAL'),

-- 시스템 오류
('SYSTEM_ERROR', 'ADMIN', '시스템 오류 - 관리자', '[크리투스 코칭] 시스템 오류
{오류메시지}
확인 필요', 'EVENT');

CREATE TRIGGER update_sms_templates_updated_at
    BEFORE UPDATE ON sms_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- =====================================================
-- 시스템 설정 (system_settings)
-- =====================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SMS 설정 초기값
INSERT INTO system_settings (key, value) VALUES 
('sms_enabled', '{"STUDENT": false, "COACH": false, "ADMIN": true}')
ON CONFLICT (key) DO NOTHING;

