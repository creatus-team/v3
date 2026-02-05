-- =====================================================
-- RCCC 테스트 데이터 (UUID 수정)
-- =====================================================

-- 1. 코치 3명
INSERT INTO coaches (name, phone, grade, bank_account, max_slots) VALUES
  ('김다혜', '01011111111', 'REGULAR', '국민 123-456-789012', 10),
  ('박민수', '01022222222', 'SENIOR', '신한 987-654-321098', 10),
  ('이지은', '01033333333', 'TRAINEE', '우리 111-222-333444', 5);

-- 2. 슬롯 (코치 ID는 위에서 생성된 것 사용)
INSERT INTO coach_slots (coach_id, day_of_week, start_time, end_time, open_chat_link, is_active)
SELECT id, '화', '19:00', '19:40', 'https://open.kakao.com/dahye1', true FROM coaches WHERE name = '김다혜';

INSERT INTO coach_slots (coach_id, day_of_week, start_time, end_time, open_chat_link, is_active)
SELECT id, '목', '19:00', '19:40', 'https://open.kakao.com/dahye2', true FROM coaches WHERE name = '김다혜';

INSERT INTO coach_slots (coach_id, day_of_week, start_time, end_time, open_chat_link, is_active)
SELECT id, '토', '10:00', '10:40', 'https://open.kakao.com/dahye3', true FROM coaches WHERE name = '김다혜';

INSERT INTO coach_slots (coach_id, day_of_week, start_time, end_time, open_chat_link, is_active)
SELECT id, '월', '20:00', '20:40', 'https://open.kakao.com/minsu1', true FROM coaches WHERE name = '박민수';

INSERT INTO coach_slots (coach_id, day_of_week, start_time, end_time, open_chat_link, is_active)
SELECT id, '수', '20:00', '20:40', 'https://open.kakao.com/minsu2', true FROM coaches WHERE name = '박민수';

INSERT INTO coach_slots (coach_id, day_of_week, start_time, end_time, open_chat_link, is_active)
SELECT id, '금', '18:00', '18:40', 'https://open.kakao.com/minsu3', true FROM coaches WHERE name = '박민수';

INSERT INTO coach_slots (coach_id, day_of_week, start_time, end_time, open_chat_link, is_active)
SELECT id, '화', '10:00', '10:40', 'https://open.kakao.com/jieun1', true FROM coaches WHERE name = '이지은';

INSERT INTO coach_slots (coach_id, day_of_week, start_time, end_time, open_chat_link, is_active)
SELECT id, '금', '14:00', '14:40', 'https://open.kakao.com/jieun2', true FROM coaches WHERE name = '이지은';

-- 3. 수강생 5명
INSERT INTO users (name, phone, email, memo, is_manual_entry) VALUES
  ('홍길동', '01012345678', 'hong@email.com', '저녁 시간 선호', false),
  ('김철수', '01087654321', 'kim@email.com', NULL, false),
  ('이영희', '01055556666', 'lee@email.com', '주말 연락 불가', false),
  ('박지민', '01077778888', NULL, NULL, true),
  ('최수진', '01099990000', 'choi@email.com', '연장 의사 있음', false);

-- 4. 세션 (수강 이력)
-- 홍길동: 김다혜 코치 화요일 - 수강중
INSERT INTO sessions (user_id, coach_id, slot_id, day_of_week, start_time, start_date, end_date, extension_count, status, payment_amount, payment_date, product_name)
SELECT 
  u.id, c.id, s.id, '화', '19:00', '2025-01-14', '2025-02-10', 2, 'ACTIVE', 400000, '2025-01-10', '래피드코칭 4회'
FROM users u, coaches c, coach_slots s
WHERE u.name = '홍길동' AND c.name = '김다혜' AND s.coach_id = c.id AND s.day_of_week = '화' AND s.start_time = '19:00';

-- 김철수: 박민수 코치 월요일 - 수강중 (종료 임박)
INSERT INTO sessions (user_id, coach_id, slot_id, day_of_week, start_time, start_date, end_date, extension_count, status, payment_amount, payment_date, product_name)
SELECT 
  u.id, c.id, s.id, '월', '20:00', '2025-01-06', '2025-01-27', 0, 'ACTIVE', 500000, '2025-01-03', '래피드코칭 4회 (선임)'
FROM users u, coaches c, coach_slots s
WHERE u.name = '김철수' AND c.name = '박민수' AND s.coach_id = c.id AND s.day_of_week = '월';

-- 이영희: 이지은 코치 화요일 - 대기
INSERT INTO sessions (user_id, coach_id, slot_id, day_of_week, start_time, start_date, end_date, extension_count, status, payment_amount, payment_date, product_name)
SELECT 
  u.id, c.id, s.id, '화', '10:00', '2025-01-28', '2025-02-24', 0, 'PENDING', 400000, '2025-01-20', '래피드코칭 4회'
FROM users u, coaches c, coach_slots s
WHERE u.name = '이영희' AND c.name = '이지은' AND s.coach_id = c.id AND s.day_of_week = '화';

-- 박지민: 김다혜 코치 목요일 - 수강중
INSERT INTO sessions (user_id, coach_id, slot_id, day_of_week, start_time, start_date, end_date, extension_count, status, payment_amount, payment_date, product_name)
SELECT 
  u.id, c.id, s.id, '목', '19:00', '2025-01-09', '2025-02-05', 1, 'ACTIVE', 400000, '2025-01-05', '래피드코칭 4회'
FROM users u, coaches c, coach_slots s
WHERE u.name = '박지민' AND c.name = '김다혜' AND s.coach_id = c.id AND s.day_of_week = '목';

-- 최수진: 과거 세션 (종료됨)
INSERT INTO sessions (user_id, coach_id, slot_id, day_of_week, start_time, start_date, end_date, extension_count, status, payment_amount, payment_date, product_name)
SELECT 
  u.id, c.id, s.id, '수', '20:00', '2024-12-01', '2024-12-28', 0, 'EXPIRED', 500000, '2024-11-28', '래피드코칭 4회 (선임)'
FROM users u, coaches c, coach_slots s
WHERE u.name = '최수진' AND c.name = '박민수' AND s.coach_id = c.id AND s.day_of_week = '수';

-- 5. 연기 기록
INSERT INTO postponements (session_id, postponed_date, reason)
SELECT s.id, '2025-01-21', '수강생 개인 사정'
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE u.name = '홍길동';

INSERT INTO postponements (session_id, postponed_date, reason)
SELECT s.id, '2025-01-16', '코치 휴무'
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE u.name = '박지민';

-- 6. 활동 로그
INSERT INTO user_activity_logs (user_id, session_id, action_type, reason, metadata)
SELECT u.id, s.id, 'ENROLL', NULL, '{"source": "latpeed"}'::jsonb
FROM users u
JOIN sessions s ON s.user_id = u.id
WHERE u.name = '홍길동';

INSERT INTO user_activity_logs (user_id, session_id, action_type, reason, metadata)
SELECT u.id, s.id, 'ENROLL', NULL, '{"source": "latpeed"}'::jsonb
FROM users u
JOIN sessions s ON s.user_id = u.id
WHERE u.name = '김철수';

INSERT INTO user_activity_logs (user_id, session_id, action_type, reason, metadata)
SELECT u.id, s.id, 'ENROLL', NULL, '{"source": "latpeed"}'::jsonb
FROM users u
JOIN sessions s ON s.user_id = u.id
WHERE u.name = '이영희';

INSERT INTO user_activity_logs (user_id, session_id, action_type, reason, metadata)
SELECT u.id, NULL, 'ENROLL', '수동등록 - 현금결제', '{"manual": true}'::jsonb
FROM users u
WHERE u.name = '박지민';

-- 7. 시스템 로그
INSERT INTO system_logs (event_type, status, message, process_status, raw_data) VALUES
  ('WEBHOOK_RECEIVED', 'SUCCESS', '웹훅 수신 성공: 홍길동', 'SUCCESS', '{"name": "홍길동", "phone": "01012345678"}'),
  ('SESSION_CREATED', 'SUCCESS', '세션 생성: 홍길동 → 김다혜/화/19:00', 'SUCCESS', NULL),
  ('SMS_SENT', 'SUCCESS', '문자 발송 성공: 01012345678', 'SUCCESS', NULL),
  ('SMS_FAILED', 'FAILED', '문자 발송 실패: 01099999999 (잘못된 번호)', 'PENDING', '{"error": "Invalid phone number"}'),
  ('PARSE_FAILED', 'FAILED', '파싱 실패: 김다혜 / 화요일 / 19시', 'PENDING', '{"raw": "김다혜 / 화요일 / 19시"}');

-- 8. 인박스
INSERT INTO ingestion_inbox (raw_text, error_message, error_type, manual_resolution_status) VALUES
  ('김다혜 / 화요일 / 19시', '시간 형식 오류 - HH:MM 형식이어야 함', 'PARSE_FAILED', 'PENDING'),
  ('박영수 / 화 / 19:00', '슬롯 충돌 - 김다혜/화/19:00 이미 사용중', 'SLOT_CONFLICT', 'PENDING');
