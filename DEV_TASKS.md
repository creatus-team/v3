# RCCC 개발 태스크 목록

> PRD v3.13 기준 전체 구현 체크리스트
> 완료 시 [x] 체크

---

## 1. 프로젝트 초기 설정

### 1.1 환경 설정
- [ ] Next.js 14 + TypeScript 프로젝트 생성
- [ ] Tailwind CSS 설정
- [ ] Shadcn/UI 설치 및 설정
- [ ] Supabase 프로젝트 생성 및 연결
- [ ] dayjs + timezone 플러그인 설정
- [ ] .env.local 환경변수 설정
- [ ] .env.example 작성

### 1.2 Next.js 설정
- [ ] next.config.js 캐싱 비활성화 설정
- [ ] 모든 API 라우트에 `export const dynamic = 'force-dynamic'` 추가
- [ ] 모든 API 라우트에 `export const revalidate = 0` 추가

### 1.3 폴더 구조
- [ ] app/ 구조 생성
- [ ] components/ 구조 생성
- [ ] lib/ 구조 생성 (utils, constants, supabase)
- [ ] types/ 구조 생성

---

## 2. 상수 및 타입 정의

### 2.1 constants.ts
- [ ] SESSION_STATUS 정의 (PENDING, ACTIVE, EXPIRED, CANCELLED, REFUNDED, EARLY_TERMINATED)
- [ ] PAYMENT_STATUS 정의 (결제 완료, 결제 취소)
- [ ] COACH_GRADE 정의 (TRAINEE, REGULAR, SENIOR)
- [ ] COACH_SETTLEMENT 정의 (등급별 단가 + 회사/코치 수익)
- [ ] ACTION_TYPE 정의 (ENROLL, RENEWAL, CANCEL, REFUND, POSTPONE, EARLY_TERMINATE, EDIT, SLOT_TIME_CHANGE, USER_MERGE)
- [ ] EVENT_TYPE 정의 (웹훅/문자/환불 등)
- [ ] LOG_PROCESS_STATUS 정의 (SUCCESS, PENDING, RESOLVED, IGNORED)
- [ ] INBOX_STATUS 정의 (PENDING, RESOLVED, IGNORED)
- [ ] INBOX_ERROR_TYPE 정의 (PARSE_FAILED, SLOT_CONFLICT, REFUND_MATCH_FAILED)
- [ ] EARLY_TERMINATION_REASON 정의 (REFUND, OTHER)
- [ ] MANUAL_ENTRY_REASON 정의 (CASH_PAYMENT, FREE_TRIAL, TEST, SYSTEM_RECOVERY, OTHER)
- [ ] TIMEZONE 정의 ('Asia/Seoul')
- [ ] API_CONFIG 정의 (SMS_TIMEOUT_MS: 5000)
- [ ] LESSON_DURATION_WEEKS 정의 (4)

### 2.2 TypeScript 타입
- [ ] User 타입 정의
- [ ] Coach 타입 정의
- [ ] CoachSlot 타입 정의
- [ ] Session 타입 정의
- [ ] Postponement 타입 정의
- [ ] SystemLog 타입 정의
- [ ] SmsLog 타입 정의
- [ ] InboxItem 타입 정의
- [ ] Settlement 타입 정의
- [ ] ActivityLog 타입 정의
- [ ] ChangeLog 타입 정의

---

## 3. 데이터베이스 (Supabase)

### 3.1 테이블 생성
- [ ] users 테이블 (수강생)
- [ ] coaches 테이블 (코치)
- [ ] coach_slots 테이블 (슬롯)
- [ ] sessions 테이블 (수강 이력)
- [ ] postponements 테이블 (연기 기록)
- [ ] user_activity_logs 테이블 (활동 로그)
- [ ] change_logs 테이블 (변경 이력)
- [ ] system_logs 테이블 (시스템 로그)
- [ ] sms_logs 테이블 (문자 로그)
- [ ] reminder_logs 테이블 (리마인더 로그)
- [ ] ingestion_inbox 테이블 (인박스)
- [ ] settlement_locks 테이블 (정산 확정)

### 3.2 인덱스 생성
- [ ] idx_sessions_status
- [ ] idx_sessions_end_date
- [ ] idx_sessions_start_date
- [ ] idx_sessions_coach_id
- [ ] idx_sessions_user_id
- [ ] idx_users_phone
- [ ] idx_system_logs_created_at
- [ ] idx_system_logs_event_type
- [ ] idx_activity_logs_user_id
- [ ] idx_inbox_status
- [ ] idx_reminder_logs_date
- [ ] idx_postponements_session
- [ ] idx_postponements_date
- [ ] idx_settlement_locks

### 3.3 Supabase Realtime 설정
- [ ] sessions 테이블 Realtime 활성화
- [ ] system_logs 테이블 Realtime 활성화
- [ ] ingestion_inbox 테이블 Realtime 활성화

---

## 4. API 엔드포인트

### 4.1 데이터 수신 API
- [ ] POST /api/ingest/sheet - 구글시트 웹훅 수신
  - [ ] 멱등성 체크 (idempotency_key)
  - [ ] 구매옵션 파싱 (코치/요일/시간 추출)
  - [ ] 신규 등록 분기
  - [ ] 재결제 분기
  - [ ] 환불 분기
  - [ ] 원본 데이터 저장 (raw_data)
  - [ ] 실패 시 인박스 이동
  - [ ] 시스템 로그 기록
- [ ] POST /api/ingest/tally - Tally 설문 수신

### 4.2 세션 API
- [ ] GET /api/sessions - 세션 목록 조회
- [ ] GET /api/sessions/today - 오늘의 수업 목록 (KST 기준)
- [ ] PATCH /api/sessions/[id] - 세션 수정
- [ ] POST /api/sessions/[id]/cancel - 세션 취소
  - [ ] 슬롯 자동 오픈
  - [ ] 히스토리 기록 (CANCEL)
  - [ ] 문자 발송 (수강생/코치/관리자)
- [ ] POST /api/sessions/[id]/postpone - 수강 연기
  - [ ] postponements 테이블에 날짜 기록
  - [ ] 히스토리 기록 (POSTPONE)
  - [ ] 문자 발송 (수강생/코치)

### 4.3 코치 API
- [ ] GET /api/coaches - 코치 목록 (슬롯 0개는 아래로)
- [ ] POST /api/coaches - 코치 추가
  - [ ] 전화번호 중복 체크 및 알림
- [ ] PATCH /api/coaches/[id] - 코치 정보 수정
- [ ] GET /api/coaches/[id]/calendar - 코치 캘린더
  - [ ] 수업 날짜 표시
  - [ ] 연기 날짜 다르게 표시
  - [ ] 이번 달 코칭 횟수 (연기 제외)

### 4.4 슬롯 API
- [ ] GET /api/slots - 슬롯 목록
- [ ] GET /api/slots/available - 빈 슬롯 목록
- [ ] POST /api/slots - 슬롯 추가
- [ ] PATCH /api/slots/[id] - 슬롯 수정/비활성화
  - [ ] 수강생 있으면 비활성화 막기
  - [ ] 시간 변경 시 히스토리 기록 (SLOT_TIME_CHANGE)
  - [ ] 시간 변경 시 문자 발송
- [ ] DELETE /api/slots/[id] - 빈 슬롯 삭제

### 4.5 수강생 API
- [ ] GET /api/users - 수강생 목록
  - [ ] 상태 필터 (전체/수강중/대기/종료예정/종료/환불취소)
  - [ ] 정렬 (종료임박순/등록일순/이름순/코치별)
  - [ ] 상태는 세션 기준 자동 계산
- [ ] GET /api/users/search - 수강생 검색 (이름/전화번호)
- [ ] POST /api/users - 수강생 직접 추가 (수동등록)
  - [ ] 사유 선택 (MANUAL_ENTRY_REASON)
  - [ ] 히스토리 기록
- [ ] PATCH /api/users/[id] - 수강생 정보 수정
- [ ] POST /api/users/merge - 수강생 병합
  - [ ] 세션 이동
  - [ ] 병합 대상 삭제
  - [ ] 히스토리 기록 (USER_MERGE)

### 4.6 시스템 로그 API
- [ ] GET /api/logs - 시스템 로그 목록
  - [ ] 날짜 필터 (오늘/어제/최근7일/날짜선택)
  - [ ] 상태 필터 (전체/미처리/처리완료)
  - [ ] 오류만 필터
- [ ] POST /api/logs/[id]/retry - 문자 발송 재시도
- [ ] POST /api/logs/[id]/reprocess - 웹훅 원본 데이터 재처리
- [ ] PATCH /api/logs/[id]/status - 로그 상태 변경 (RESOLVED/IGNORED)

### 4.7 인박스 API
- [ ] GET /api/inbox - 인박스 목록
- [ ] PATCH /api/inbox/[id]/status - 인박스 상태 변경

### 4.8 정산 API
- [ ] GET /api/settlement - 코치 정산 (월별 조회)
  - [ ] 연기 날짜 제외
  - [ ] 환불일 이후 제외
  - [ ] 조기종료일 이후 제외
  - [ ] 등급별 단가 적용
- [ ] GET /api/settlement/summary - 월 요약 (매출/지급/수익)
- [ ] POST /api/settlement/lock - 정산 확정
- [ ] POST /api/settlement/unlock - 정산 확정 취소

### 4.9 문자 발송 API
- [ ] POST /api/notify/extension-reminder - 연장 권유 문자 발송
- [ ] 문자 발송 공통 함수 구현
  - [ ] 5초 타임아웃 적용
  - [ ] sms_logs에 기록
  - [ ] 실패 시 재시도 가능하게

### 4.10 크론잡 API
- [ ] POST /api/cron/session-status - 세션 상태 전환
  - [ ] PENDING → ACTIVE (시작일 도래)
  - [ ] ACTIVE → EXPIRED (종료일 경과)
- [ ] POST /api/cron/reminder - 리마인더 발송
  - [ ] 내일 수업 있는 수강생/코치에게 문자

---

## 5. 화면 (Frontend)

### 5.1 대시보드 (/)
- [ ] KPI 카드 (빈슬롯/인박스/수강중/종료예정/오류)
- [ ] 오늘의 수업 목록
- [ ] 인박스 섹션
  - [ ] [수동 처리] 버튼
  - [ ] [수동 배정] 버튼
  - [ ] [재처리] 버튼
  - [ ] [처리완료] 버튼
  - [ ] [무시] 버튼
- [ ] Supabase Realtime 실시간 갱신

### 5.2 코치 화면 (/coaches)
- [ ] 좌측: 코치 목록
  - [ ] 슬롯 0개 코치 아래로 정렬
  - [ ] [코치 추가] 버튼
  - [ ] [수정] 버튼
  - [ ] 전화번호 중복 시 알림
- [ ] 우측 상단: 슬롯 필터 버튼 (전체/진행중/종료예정/빈슬롯)
- [ ] 우측 중단: 선택한 코치의 슬롯 상세
  - [ ] 슬롯 상태 표시 (🟢진행중/🟡종료예정/⚪빈슬롯)
  - [ ] [+ 슬롯 추가] 버튼
  - [ ] [수정] 버튼
  - [ ] [비활성화] 버튼 (수강생 있으면 막기)
  - [ ] [삭제] 버튼 (빈 슬롯만)
  - [ ] 오픈톡 링크 복사 버튼
  - [ ] [연장 권유 문자 발송] 버튼
- [ ] 우측 하단: 코치 캘린더
  - [ ] 수업 날짜 표시
  - [ ] 연기 날짜 다르게 표시
  - [ ] 이번 달 코칭 횟수 (연기 제외)

### 5.3 수강생 화면 (/students)
- [ ] 검색 (이름/전화번호)
- [ ] 필터 (전체/수강중/대기/종료예정/종료/환불취소)
- [ ] 정렬 (종료임박순/등록일순/이름순/코치별)
- [ ] [+ 수강생 추가] 버튼 (수동등록)
- [ ] 펼쳐지는 목록 형식
  - [ ] 수강생 기본 정보 (이름/전화번호/상태/D-Day)
  - [ ] 연장 횟수 표시 ("3회차 수강")
  - [ ] 남은 수업 횟수 ("4회 중 2회 완료")
  - [ ] (수동등록) 표시
- [ ] 펼쳤을 때 상세 정보
  - [ ] 기본정보 섹션
  - [ ] 현재 수강 섹션 (결제금액/결제일/상품명)
  - [ ] 과거 세션 목록
  - [ ] 히스토리 (시간순)
  - [ ] 변경 이력
  - [ ] 메모
  - [ ] [수강 연기] 버튼 (1주/2주/3주 선택)
  - [ ] [정보 수정] 버튼
  - [ ] [수강 취소] 버튼 (확인창 + 사유 필수)
  - [ ] [병합] 버튼

### 5.4 수강생 상태 표시 (세션 기준 자동)
- [ ] 🟢 수강중 = ACTIVE 세션 있음
- [ ] ⏸️ 대기 = PENDING만 있음
- [ ] ⚫ 종료 = 전부 EXPIRED
- [ ] 💸 환불 = 최근 REFUNDED
- [ ] ❌ 취소 = 최근 CANCELLED
- [ ] 🔸 조기종료 = EARLY_TERMINATED

### 5.5 메시지 화면 (/messages)
- [ ] 날짜 필터 (오늘/어제/최근7일/날짜선택)
- [ ] 상태 필터 (전체/미처리/처리완료)
- [ ] 오류만 체크박스
- [ ] 로그 목록
  - [ ] 상태 아이콘 (🟢성공/🔴실패/🟡경고)
  - [ ] 처리상태 (⚪미처리/✅처리완료/⛔무시됨)
  - [ ] [상세 ▼] 펼치기 버튼
- [ ] 로그 상세 (펼쳤을 때)
  - [ ] 기본 정보
  - [ ] 에러 상세
  - [ ] 원본 데이터 (JSON)
  - [ ] [재시도] 버튼 (문자)
  - [ ] [재처리] 버튼 (웹훅)
  - [ ] [처리완료] 버튼
  - [ ] [무시] 버튼
- [ ] Supabase Realtime 실시간 갱신

### 5.6 정산 화면 (/settlement)
- [ ] 월 선택 (◀ 이전 / 다음 ▶)
- [ ] 정산 확정 상태 표시 (✅ 확정됨)
- [ ] 코치별 정산 테이블
  - [ ] 코치명
  - [ ] 등급
  - [ ] 1회 단가
  - [ ] 코칭횟수
  - [ ] 정산금
  - [ ] [보기] 버튼 (상세)
- [ ] 코치 지급 합계
- [ ] 월 요약
  - [ ] 총 코칭 건수
  - [ ] 총 매출
  - [ ] 코치 지급
  - [ ] 회사 수익
- [ ] [정산 확정] 버튼
- [ ] [확정 취소] 버튼 (확정된 경우)
- [ ] 코치 상세 모달 (날짜별 세션 목록)
- [ ] 읽기 전용 (수정 버튼 없음)
- [ ] 확정된 월 세션 수정 시 경고창

---

## 6. 핵심 비즈니스 로직

### 6.1 구매옵션 파싱
- [ ] "김다혜 / 화 / 19:00" 형식 파싱
- [ ] 공백/구분자 정규화
- [ ] 시간 형식 정규화 ("19시" → "19:00")
- [ ] 파싱 실패 시 인박스 이동

### 6.2 환불 자동 처리
- [ ] "결제 취소" 데이터 감지
- [ ] 전화번호 + 코치 + 요일 + 시간으로 세션 찾기
- [ ] 세션 REFUNDED 처리
- [ ] 슬롯 자동 오픈
- [ ] 취소사유 저장
- [ ] 매칭 실패 시 인박스 이동 (REFUND_MATCH_FAILED)
- [ ] 관리자 알림

### 6.3 정산 계산
- [ ] 코칭 횟수 = 해당 월의 수업 요일 수
- [ ] 연기한 날짜 제외
- [ ] 환불일 이후 제외
- [ ] 조기종료일 이후 제외
- [ ] 등급별 단가 적용
- [ ] 등급 변경 시 해당 월은 변경 전 등급으로

### 6.4 날짜 계산
- [ ] 모든 날짜는 KST 기준
- [ ] 종료일 = 시작일 + (4주 - 1일)
- [ ] D-Day 계산

### 6.5 수강생 상태 판단 (세션 기준)
- [ ] ACTIVE 세션 있음 → 수강중
- [ ] PENDING만 있음 → 대기
- [ ] 전부 EXPIRED → 종료
- [ ] 최근 REFUNDED → 환불
- [ ] 최근 CANCELLED → 취소

---

## 7. 문자 발송

### 7.1 Solapi 연동
- [ ] Solapi API 연결
- [ ] 5초 타임아웃 설정
- [ ] provider_message_id 저장

### 7.2 발송 시점별 구현
- [ ] 신규 등록 → 수강생/코치/관리자
- [ ] 재결제 (연장) → 수강생/코치
- [ ] Latpeed 환불 → 관리자
- [ ] 환불 매칭 실패 → 관리자
- [ ] 수강 취소 (수동) → 수강생/코치/관리자
- [ ] 수강 연기 → 수강생/코치
- [ ] 슬롯 시간 변경 → 수강생/코치
- [ ] 수업 하루 전 → 수강생/코치
- [ ] Tally 설문 제출 → 수강생/코치
- [ ] 슬롯 충돌 → 관리자
- [ ] 시스템 오류 → 관리자
- [ ] 연장 권유 (수동) → 수강생

### 7.3 재시도 기능
- [ ] sms_logs에서 실패 건 조회
- [ ] 재시도 버튼 클릭 시 재발송
- [ ] retry_count 증가

---

## 8. 크론잡

### 8.1 세션 상태 전환
- [ ] 매일 0시 5분 (KST) 실행
- [ ] PENDING → ACTIVE (시작일 = 오늘)
- [ ] ACTIVE → EXPIRED (종료일 = 어제)

### 8.2 리마인더 발송
- [ ] 매일 오후 6시 (KST) 실행
- [ ] 내일 수업 있는 수강생/코치 조회
- [ ] 중복 발송 방지 (reminder_logs)
- [ ] 문자 발송

### 8.3 Vercel Cron 설정
- [ ] vercel.json에 cron 설정
- [ ] 또는 Supabase Edge Function 사용

---

## 9. 안전장치

### 9.1 확인창
- [ ] 수강 취소 시 확인창 + 사유 필수
- [ ] 슬롯 비활성화 (수강생 있을 때) 막기
- [ ] 슬롯 시간 수정 시 확인창
- [ ] 날짜 수정 시 전/후 비교 표시
- [ ] 수강생 병합 시 경고 + 확인

### 9.2 정산 보호
- [ ] 확정된 월 세션 수정 시 경고창

---

## 10. 히스토리 기록

### 10.1 user_activity_logs에 기록
- [ ] ENROLL - 신규 등록
- [ ] RENEWAL - 재결제
- [ ] CANCEL - 취소
- [ ] REFUND - 환불
- [ ] POSTPONE - 연기
- [ ] EARLY_TERMINATE - 조기종료
- [ ] EDIT - 정보 수정
- [ ] SLOT_TIME_CHANGE - 슬롯 시간 변경
- [ ] USER_MERGE - 수강생 병합

### 10.2 change_logs에 기록
- [ ] 모든 데이터 수정 시 자동 기록
- [ ] 테이블명/레코드ID/필드명/이전값/새값/시간

### 10.3 system_logs에 기록
- [ ] 웹훅 수신 성공/실패
- [ ] 문자 발송 성공/실패
- [ ] 환불 자동 처리
- [ ] 크론잡 실행

---

## 11. 테스트

### 11.1 웹훅 테스트
- [ ] 신규 등록 웹훅 처리
- [ ] 재결제 웹훅 처리
- [ ] 환불 웹훅 처리
- [ ] 멱등성 테스트 (같은 웹훅 2번)
- [ ] 파싱 실패 → 인박스

### 11.2 환불 테스트
- [ ] 환불 자동 매칭 성공
- [ ] 환불 매칭 실패 → 인박스

### 11.3 정산 테스트
- [ ] 연기 날짜 제외 확인
- [ ] 환불일 이후 제외 확인
- [ ] 조기종료일 이후 제외 확인
- [ ] 등급별 단가 확인
- [ ] 월 경계 세션 분리 확인

### 11.4 실시간 테스트
- [ ] 대시보드 실시간 갱신
- [ ] 메시지 화면 실시간 갱신

### 11.5 문자 테스트
- [ ] 발송 성공
- [ ] 타임아웃 처리
- [ ] 재시도 기능

---

## 12. 배포

### 12.1 Vercel 배포
- [ ] Vercel 프로젝트 연결
- [ ] 환경변수 설정
- [ ] 크론잡 설정

### 12.2 Supabase 설정
- [ ] 프로덕션 DB 설정
- [ ] Realtime 활성화
- [ ] RLS (Row Level Security) 설정 (필요시)

---

## 13. 추후 작업 (MVP 이후)

- [ ] 연장 권유 문자 템플릿 작성
- [ ] 문자 템플릿 관리 화면
- [ ] 코치 휴무 기능
- [ ] 관리자 로그인 (Supabase Auth)
- [ ] 데이터 내보내기 (엑셀 다운로드)

---

## 진행 상황 요약

| 카테고리 | 완료 | 전체 | 진행률 |
|---------|------|------|--------|
| 1. 초기 설정 | 0 | 13 | 0% |
| 2. 상수/타입 | 0 | 26 | 0% |
| 3. 데이터베이스 | 0 | 28 | 0% |
| 4. API | 0 | 60 | 0% |
| 5. 화면 | 0 | 85 | 0% |
| 6. 비즈니스 로직 | 0 | 22 | 0% |
| 7. 문자 발송 | 0 | 18 | 0% |
| 8. 크론잡 | 0 | 8 | 0% |
| 9. 안전장치 | 0 | 6 | 0% |
| 10. 히스토리 | 0 | 15 | 0% |
| 11. 테스트 | 0 | 16 | 0% |
| 12. 배포 | 0 | 5 | 0% |
| **총계** | **0** | **302** | **0%** |
