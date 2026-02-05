-- ============================================
-- 기존 세션 start_date 보정 스크립트
-- 
-- 문제: calculateStartDate가 "가장 가까운 다음 해당 요일"로 계산했기 때문에
--       결제일 이후 같은 주에 수업 요일이 남아있으면 그 주로 시작일이 잡혔음
--       올바른 규칙: 무조건 다음 주 해당 요일
--
-- 영향: start_date, end_date 모두 보정 필요
--       end_date = start_date + 27일 유지
-- ============================================

-- 1단계: 보정 대상 확인 (DRY RUN)
-- 결제일(payment_date) ~ 시작일(start_date) 간격이 7일 미만인 세션 조회
-- (재결제 제외 - extension_count = 0만)
SELECT 
  s.id,
  u.name AS 수강생명,
  s.day_of_week AS 수업요일,
  s.payment_date AS 결제일,
  s.start_date AS 현재_시작일,
  s.end_date AS 현재_종료일,
  s.start_date::date - s.payment_date::date AS 결제_시작_간격일,
  s.status,
  s.extension_count
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.extension_count = 0  -- 신규 결제만 (재결제는 end_date+1 규칙이라 정상)
  AND s.payment_date IS NOT NULL
  AND (s.start_date::date - s.payment_date::date) < 7  -- 7일 미만이면 같은 주로 잡힌 것
ORDER BY s.payment_date DESC;

-- 2단계: 실제 보정 (위 결과 확인 후 실행)
-- start_date를 7일 뒤로, end_date도 따라서 7일 뒤로
UPDATE sessions s
SET 
  start_date = (s.start_date::date + INTERVAL '7 days')::date::text,
  end_date = (s.end_date::date + INTERVAL '7 days')::date::text
WHERE s.extension_count = 0
  AND s.payment_date IS NOT NULL
  AND (s.start_date::date - s.payment_date::date) < 7
  AND s.status IN ('PENDING', 'ACTIVE');
  -- EXPIRED, REFUNDED 등 이미 끝난 세션은 건드리지 않음
  -- (정산이 이미 완료됐을 수 있으므로)

-- 3단계: 보정 결과 확인
SELECT 
  s.id,
  u.name AS 수강생명,
  s.day_of_week AS 수업요일,
  s.payment_date AS 결제일,
  s.start_date AS 보정된_시작일,
  s.end_date AS 보정된_종료일,
  s.start_date::date - s.payment_date::date AS 결제_시작_간격일,
  s.status
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.extension_count = 0
  AND s.payment_date IS NOT NULL
  AND s.status IN ('PENDING', 'ACTIVE')
ORDER BY s.payment_date DESC;

-- ============================================
-- 주의사항:
-- 1. 반드시 1단계(DRY RUN)를 먼저 실행해서 대상 확인
-- 2. EXPIRED/REFUNDED 세션은 정산이 완료됐을 수 있어 건드리지 않음
-- 3. 재결제(extension_count > 0)는 calculateRenewalStartDate (end_date+1)로
--    계산되므로 이 버그와 무관
-- 4. 이 스크립트는 Supabase SQL Editor에서 실행
-- ============================================
