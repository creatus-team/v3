# RCCC 프로젝트 인수인계 문서

## 📌 프로젝트 개요

**RCCC (Rapid Coaching Control Center)**는 래피드코칭 서비스의 수강생/코치 관리 시스템입니다.

- **기술 스택**: Next.js 14 + TypeScript + Supabase + Tailwind CSS + shadcn/ui
- **배포**: Vercel
- **GitHub**: https://github.com/creatus-team/v3.git
- **운영 URL**: https://v3-five-theta.vercel.app/

---

## 🔄 핵심 비즈니스 플로우

### 신규 등록 플로우
```
구글시트(결제 정보 입력)
    ↓
GAS(Google Apps Script)가 변경 감지
    ↓
웹훅 POST /api/ingest/sheet
    ↓
구매옵션 파싱 ("코치명 / 요일 / 시작시간 ~ 종료시간")
    ↓
수강생 생성 또는 조회 (전화번호 기준)
    ↓
코치/슬롯 매칭
    ↓
세션 생성 (start_date: 다음 주 해당 요일, end_date: +4주)
    ↓
문자 발송 (수강생, 코치, 관리자)
```

### 재결제(연장) 플로우
```
구글시트(재결제 시트에 입력)
    ↓
GAS → 웹훅
    ↓
기존 ACTIVE 세션 찾기
    ↓
end_date 연장 (+4주, 기존 종료일 기준 연속)
    ↓
문자 발송
```

### 환불 플로우
```
구글시트(상태: "환불")
    ↓
GAS → 웹훅
    ↓
ACTIVE 세션 찾기
    ↓
상태 → REFUNDED, 슬롯 비활성화
    ↓
관리자에게 문자
```

### 슬롯 충돌 시
```
웹훅 수신 → 슬롯이 이미 사용 중
    ↓
ingestion_inbox 테이블에 저장 (error_type: SLOT_CONFLICT)
    ↓
대시보드 인박스에서 수동 처리
    - 다른 슬롯에 배정
    - 무시
```

---

## 🗂️ 폴더 구조

```
/src
├── app/
│   ├── api/
│   │   ├── coaches/           # 코치 CRUD
│   │   ├── users/             # 수강생 CRUD
│   │   ├── sessions/          # 세션 관리
│   │   ├── slots/             # 슬롯 관리
│   │   ├── ingest/
│   │   │   ├── sheet/         # 구글시트 웹훅 (핵심!)
│   │   │   └── tally/         # Tally 설문 웹훅
│   │   ├── inbox/             # 인박스 수동처리
│   │   ├── cron/
│   │   │   ├── reminder/      # 리마인더 (D-1, D-2)
│   │   │   └── session-status/ # 세션 상태 전환
│   │   ├── settlement/        # 정산
│   │   ├── sms-templates/     # 문자 템플릿 API
│   │   ├── logs/              # 시스템 로그
│   │   └── notify/            # 알림 발송
│   │
│   ├── page.tsx               # 대시보드
│   ├── coaches/               # 코치 관리 화면
│   ├── students/              # 수강생 관리 화면
│   ├── messages/              # 메시지/로그 화면
│   ├── settlement/            # 정산 화면
│   └── settings/              # 설정 (문자 템플릿)
│
├── components/
│   ├── ui/                    # shadcn/ui 컴포넌트
│   ├── dashboard/
│   ├── coaches/
│   ├── students/
│   ├── messages/
│   ├── settlement/
│   ├── settings/
│   └── navigation.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts          # 브라우저용
│   │   └── server.ts          # 서버용
│   ├── sms/
│   │   ├── index.ts           # sendSms 함수
│   │   ├── solapi.ts          # Solapi API
│   │   ├── templates.ts       # 하드코딩 템플릿 (레거시)
│   │   └── template-sender.ts # DB 템플릿 기반 발송
│   ├── utils/
│   │   ├── date-calculator.ts # 날짜 계산 (다음 주 요일 등)
│   │   ├── phone-normalizer.ts # 전화번호 정규화
│   │   ├── option-parser.ts   # 구매옵션 파싱
│   │   ├── excel-export.ts    # 엑셀 내보내기
│   │   ├── change-logger.ts   # 변경 이력 기록
│   │   └── idempotency.ts     # 멱등키 생성
│   ├── constants.ts           # 상수 정의
│   ├── dayjs.ts               # dayjs + 한국 시간대
│   └── webhook-auth.ts        # 웹훅 토큰 검증
│
├── types/
│   └── index.ts               # 타입 정의
│
/gas
├── Code.gs                    # Google Apps Script 코드
└── SETUP.md                   # GAS 설정 가이드

/supabase-schema.sql           # DB 스키마 (전체)
/vercel.json                   # 크론잡 설정
```

---

## 🗄️ 데이터베이스 구조

### 핵심 테이블

**users** (수강생)
```sql
- id: UUID
- name: 이름
- phone: 전화번호 (UNIQUE, 01012345678 형식)
- email: 이메일
- memo: 메모
- is_manual_entry: 수동 등록 여부
- manual_entry_reason: 수동 등록 사유
```

**coaches** (코치)
```sql
- id: UUID
- name: 이름
- phone: 전화번호
- grade: 등급 (TRAINEE/REGULAR/SENIOR)
- bank_account: 계좌번호
- max_slots: 최대 슬롯 수
```

**coach_slots** (슬롯)
```sql
- id: UUID
- coach_id: 코치 FK
- day_of_week: 요일 (월/화/수/목/금/토/일)
- start_time: 시작 시간 (HH:MM:SS)
- end_time: 종료 시간
- open_chat_link: 오픈카톡 링크
- is_active: 활성화 여부
```

**sessions** (수강 세션) - 가장 중요!
```sql
- id: UUID
- user_id: 수강생 FK
- coach_id: 코치 FK
- slot_id: 슬롯 FK
- day_of_week: 요일
- start_time: 시간
- start_date: 시작일 (YYYY-MM-DD)
- end_date: 종료일
- status: 상태
  - PENDING: 대기 (시작일 전)
  - ACTIVE: 수강중
  - EXPIRED: 종료
  - CANCELLED: 취소
  - REFUNDED: 환불
- payment_amount: 결제 금액
- weeks: 주 수 (기본 4)
```

**postponements** (연기)
```sql
- session_id: 세션 FK
- postponed_date: 연기한 날짜
- reason: 사유
```

**sms_templates** (문자 템플릿)
```sql
- event_type: 이벤트 종류 (NEW_ENROLL, CANCEL 등)
- recipient_type: 수신자 (STUDENT/COACH/ADMIN)
- content: 문자 내용 ({수강생명}, {코치명} 등 변수)
- is_active: ON/OFF
- trigger_type: EVENT/SCHEDULE/MANUAL
- schedule_days_before: D-N일 전
- schedule_time: 발송 시간
```

**ingestion_inbox** (인박스)
```sql
- raw_webhook_id: 원본 웹훅 FK
- raw_text: 원본 데이터
- error_message: 에러 메시지
- error_type: PARSE_FAILED / SLOT_CONFLICT / REFUND_MATCH_FAILED
- manual_resolution_status: PENDING / RESOLVED / IGNORED
```

**system_logs** (시스템 로그)
```sql
- event_type: 이벤트 종류
- status: SUCCESS/FAILED
- message: 메시지
- error_detail: 에러 상세
- process_status: PENDING/SUCCESS/IGNORED
```

---

## 🔑 환경 변수

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://gbbutzzuvlgdlixovteb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_7wiuhxbJRjeo7-JC3eh3Pg_xjGHmqID
SUPABASE_SERVICE_ROLE_KEY=sb_secret_vG-gAtpLPvOYT1alYES1Ag_x2rsPjZ-

# 웹훅 인증
WEBHOOK_SECRET_TOKEN=rccc-webhook-secret-2025

# Solapi 문자
SOLAPI_API_KEY=NCSSJLEAUIRDWFW7
SOLAPI_API_SECRET=LNIKTBA80LXAQLYKUAWZX46ARRYXKU6Z
SOLAPI_SENDER_NUMBER=01025179266

# 관리자 알림
ADMIN_PHONE_NUMBER=01025179266
```

> ⚠️ **보안 주의**: 이 파일에 실제 API 키가 포함되어 있습니다. 외부 유출 금지!

---

## 📡 API 엔드포인트

### 웹훅 (외부 → 시스템)

| 엔드포인트 | 용도 | 인증 |
|-----------|------|------|
| `POST /api/ingest/sheet` | 구글시트 웹훅 | Bearer 토큰 |
| `POST /api/ingest/tally` | Tally 설문 웹훅 | Bearer 토큰 |

### 크론잡 (Vercel Cron)

| 엔드포인트 | 스케줄 | 용도 |
|-----------|--------|------|
| `GET /api/cron/session-status` | 매일 00:05 KST | PENDING→ACTIVE, ACTIVE→EXPIRED |
| `GET /api/cron/reminder` | 매일 18:00 KST | D-1, D-2 리마인더 |

### 내부 API

| 엔드포인트 | 메서드 | 용도 |
|-----------|--------|------|
| `/api/coaches` | GET, POST | 코치 목록, 생성 |
| `/api/coaches/[id]` | GET, PATCH, DELETE | 코치 상세 |
| `/api/users` | GET, POST | 수강생 목록, 생성 |
| `/api/users/[id]` | GET, PATCH, DELETE | 수강생 상세 |
| `/api/users/merge` | POST | 수강생 병합 |
| `/api/sessions/[id]/cancel` | POST | 수강 취소 |
| `/api/sessions/[id]/postpone` | POST | 수강 연기 |
| `/api/slots` | GET, POST | 슬롯 목록, 생성 |
| `/api/slots/[id]` | PATCH, DELETE | 슬롯 수정 |
| `/api/inbox` | GET | 인박스 목록 |
| `/api/inbox/[id]/assign` | POST | 수동 배정 |
| `/api/inbox/[id]/reprocess` | POST | 재처리 |
| `/api/settlement` | GET | 정산 조회 |
| `/api/settlement/lock` | POST | 정산 확정 |
| `/api/sms-templates` | GET | 템플릿 목록 |
| `/api/sms-templates/[id]` | PATCH | 템플릿 수정 |

---

## 📱 화면별 기능

### 1. 대시보드 (/)
- 오늘 수업 목록 (코치별 그룹)
- 7일 내 종료 예정 수강생
- 인박스 (미처리 건)
- 최근 로그
- Realtime 자동 갱신

### 2. 코치 관리 (/coaches)
- 코치 목록 (검색, 등급 필터)
- 코치 추가/수정/삭제
- 슬롯 관리 (추가/삭제/시간 변경)
- 캘린더 보기 (월간 수업 현황)

### 3. 수강생 관리 (/students)
- 수강생 목록 (검색, 상태 필터, 정렬)
- 수강생 추가 (수동 등록)
- 수강생 정보 수정
- 수강 취소/연기
- 수강생 병합 (중복 처리)
- 엑셀 다운로드

### 4. 메시지/로그 (/messages)
- 시스템 로그 목록
- 날짜/상태 필터
- 상태 변경 (처리완료/무시)
- 문자 재시도
- 웹훅 재처리
- 엑셀 다운로드
- Realtime 자동 갱신

### 5. 정산 (/settlement)
- 월별 코치 정산 현황
- 코칭 횟수, 단가, 지급액
- 세션 상세 보기
- 정산 확정/취소
- 엑셀 다운로드

### 6. 설정 (/settings)
- 문자 템플릿 관리 (25개)
- 템플릿 ON/OFF
- 내용 수정 (변수 사용)
- 미리보기
- 리마인더 발송 시점 설정 (D-N일, 시간)

---

## 🔧 핵심 로직 설명

### 1. 구매옵션 파싱 (`/lib/utils/option-parser.ts`)
```
입력: "김다혜 / 화 / 19:00 ~ 20:00"
출력: { coachName: "김다혜", dayOfWeek: "화", startTime: "19:00", endTime: "20:00" }
```

### 2. 날짜 계산 (`/lib/utils/date-calculator.ts`)
- `getNextDayOfWeek("화")`: 다음 주 화요일 날짜
- `calculateEndDate(startDate, 4)`: 시작일 + 4주 - 1일

### 3. 전화번호 정규화 (`/lib/utils/phone-normalizer.ts`)
```
"010-1234-5678" → "01012345678"
"+82 10 1234 5678" → "01012345678"
```

### 4. 문자 발송 (`/lib/sms/index.ts`)
- Solapi API 사용
- 5초 타임아웃
- try-catch로 실패해도 프로세스 중단 안 함

### 5. 멱등키 (`/lib/utils/idempotency.ts`)
- 웹훅 중복 처리 방지
- `{이름}_{전화번호}_{구매옵션}_{timestamp_일단위}`

---

## ⚙️ GAS (Google Apps Script) 설정

### 위치
`/gas/Code.gs` - 구글시트에 붙여넣기

### 기능
1. 시트 변경 시 자동 웹훅 전송
2. 헤더 이름으로 매핑 (컬럼 순서 무관)
3. 중복 전송 방지 (서버전송 컬럼)
4. 커스텀 메뉴 (🚀 RCCC)

### 시트 구조
```
이름 | 이메일 | 전화번호 | 구매옵션 | 상태 | 결제금액 | 일시 | 결제방식 | 취소사유 | 서버전송
```

### 설정 필요 항목
```javascript
const CONFIG = {
  WEBHOOK_URL: 'https://v3-five-theta.vercel.app/api/ingest/sheet',
  WEBHOOK_SECRET_TOKEN: 'rccc-webhook-secret-2025',  // 실제 값
  NEW_PAYMENT_SHEET: '신규결제',
  RENEWAL_SHEET: '재결제',
  PROCESSED_COLUMN: '서버전송',
};
```

---

## 🚀 개발 환경 설정

```bash
# 1. 압축 해제
unzip rccc-project.zip
cd rccc

# 2. 의존성 설치
npm install

# 3. 환경변수 확인 (이미 .env.local 포함됨)
cat .env.local
# → 값 채우기

# 4. 개발 서버
npm run dev

# 5. 빌드
npm run build
```

---

## 📋 완료된 기능 목록

| # | 기능 | 상태 |
|---|------|------|
| 1 | 대시보드 | ✅ |
| 2 | 코치 CRUD | ✅ |
| 3 | 슬롯 관리 | ✅ |
| 4 | 수강생 CRUD | ✅ |
| 5 | 세션 관리 | ✅ |
| 6 | 구글시트 웹훅 (신규/연장/환불) | ✅ |
| 7 | GAS 연동 | ✅ |
| 8 | 문자 발송 (Solapi) | ✅ |
| 9 | 크론잡 (상태전환, 리마인더) | ✅ |
| 10 | 정산 관리 | ✅ |
| 11 | 인박스 수동처리 | ✅ |
| 12 | Tally 웹훅 | ✅ |
| 13 | 문자 템플릿 관리 | ✅ |
| 14 | 엑셀 내보내기 | ✅ |
| 15 | Realtime 실시간 갱신 | ✅ |
| 16 | 수강 연기/취소 | ✅ |
| 17 | 수강생 병합 | ✅ |
| 18 | 캘린더 보기 | ✅ |
| 19 | change_logs 기록 | ✅ |

---

## ⚠️ 주의사항

1. **전화번호는 항상 정규화**: `01012345678` 형식으로 저장
2. **시간대는 항상 KST**: dayjs 사용 시 `.tz()` 필수
3. **문자 발송 실패해도 중단 안 함**: try-catch 처리
4. **웹훅은 멱등키로 중복 방지**: 같은 결제 2번 처리 안 함
5. **슬롯 충돌 시 인박스로**: 자동 처리 실패 → 수동 처리
6. **웹훅 URL은 Vercel 고정 도메인 사용**: 배포 시마다 URL이 바뀔 수 있으므로, GAS 및 Tally에는 Vercel의 **Production Domain** (고정 도메인)을 사용해야 함
   - Vercel Dashboard → Settings → Domains에서 확인
   - 예: `https://v3-five-theta.vercel.app/api/ingest/sheet`
   - Preview 배포 URL (`xxx-xxx.vercel.app`)은 사용하지 말 것

---

## 🔜 향후 확장 가능 기능

- 관리자 로그인 (Supabase Auth)
- 코치 휴무 기능
- 수강생 앱/포털
- 카카오 알림톡 전환
- 통계/리포트 대시보드

---

## 📦 zip 파일에 포함된 것

| 파일/폴더 | 설명 |
|-----------|------|
| `src/` | 전체 소스코드 |
| `gas/` | Google Apps Script 코드 |
| `.env.local` | **실제 API 키 포함** |
| `HANDOVER.md` | 이 인수인계 문서 |
| `PRD.md` | 기획 문서 (PRD v3.13) |
| `DEV_TASKS.md` | 개발 태스크 체크리스트 |
| `supabase-schema.sql` | DB 스키마 전체 |
| `vercel.json` | 크론잡 설정 |
| `package.json` | 의존성 목록 |

---

## 🌐 외부 서비스 접속 정보

### Supabase (데이터베이스)
- **Dashboard**: https://supabase.com/dashboard/project/gbbutzzuvlgdlixovteb
- **Project ID**: gbbutzzuvlgdlixovteb

### Vercel (배포)
- **URL**: https://v3-five-theta.vercel.app/
- **Project**: v3

### GitHub
- **Repo**: https://github.com/creatus-team/v3.git

### Solapi (문자 발송)
- **Console**: https://console.solapi.com/
- **발신번호**: 01025179266

---

## 📞 문의

이 문서로 해결 안 되는 부분은 코드 직접 확인 추천:
- 웹훅 로직: `/src/app/api/ingest/sheet/route.ts`
- 날짜 계산: `/src/lib/utils/date-calculator.ts`
- DB 스키마: `/supabase-schema.sql`
- PRD 문서: `/PRD.md`
