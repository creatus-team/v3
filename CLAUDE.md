# RCCC (Rapid Coaching Control Center) - v3

## 프로젝트 개요

래피드코칭 서비스의 수강생/코치 관리 어드민 시스템.
구글시트 결제 → 웹훅 → 자동 등록 → 코치 매칭 → 문자 발송까지 자동화.

- **운영 URL:** https://v3-five-theta.vercel.app/
- **Supabase Project ID:** `gbbutzzuvlgdlixovteb`
- **Vercel Project ID:** `prj_zHPVXjMSbiQlJn1WFyRHtribYLlM`

---

## 기술 스택

- **Next.js 14** (App Router, TypeScript)
- **Supabase** (PostgreSQL + Realtime, RLS 비활성화 - 서버 사이드 전용)
- **shadcn/ui** (new-york 스타일) + **Tailwind CSS**
- **Vercel** 배포 (Cron Jobs 포함)
- **Solapi** 문자 발송
- **dayjs** (항상 `Asia/Seoul` 타임존)

---

## 핵심 규칙

### 시간대
- 모든 날짜/시간은 **KST (Asia/Seoul)** 기준
- dayjs는 반드시 `@/lib/dayjs`에서 import (타임존 설정 포함)
- `new Date()` 쓸 때 타임존 주의

### 인증
- 관리자: 전화번호+비밀번호 → `rccc_admin_auth` 쿠키 (Supabase Auth 안 씀)
- 웹훅: Bearer 토큰 (`WEBHOOK_SECRET_TOKEN`)
- 크론잡: `CRON_SECRET` 헤더 검증
- 코치 임베드(`/embed/coach/[id]`): 인증 없음 (읽기 전용)

### 문자 발송
- Solapi API 사용 (`@/lib/sms/solapi.ts`)
- DB 템플릿 기반 발송 (`sms_templates` 테이블, 26개)
- 문자 실패해도 프로세스 중단 안 됨 (try-catch 처리)
- `system_settings` 테이블에서 SMS ON/OFF 제어

### 안전장치
- 웹훅 중복 방지: `idempotency_key` 사용
- 변경 이력: `change_logs`, `user_activity_logs`에 자동 기록
- 자동 처리 실패 시: `ingestion_inbox`로 이동 → 대시보드에서 수동 처리

---

## DB 테이블 (public 스키마)

| 테이블 | 핵심 역할 |
|--------|----------|
| `users` | 수강생 (이름, 전화번호, 메모) |
| `coaches` | 코치 (등급: TRAINEE/REGULAR/SENIOR) |
| `coach_slots` | 코치 슬롯 (요일, 시간, 오픈톡링크) |
| `sessions` | 수강 세션 (수강생↔코치↔슬롯 매핑, 상태: PENDING→ACTIVE→EXPIRED) |
| `postponements` | 연기 기록 |
| `raw_webhooks` | 웹훅 원본 보관 |
| `ingestion_inbox` | 자동처리 실패 건 (수동 처리 대기) |
| `sms_logs` | 문자 발송 이력 |
| `sms_templates` | 문자 템플릿 |
| `reminder_logs` | 리마인더 발송 기록 (D-1, D-2) |
| `system_logs` | 시스템 이벤트 로그 |
| `user_activity_logs` | 사용자 활동 (ENROLL, RENEWAL, CANCEL 등) |
| `change_logs` | 필드 변경 이력 |
| `settlement_locks` | 월별 정산 확정 잠금 |
| `system_settings` | 시스템 설정 (SMS ON/OFF 등) |

---

## 외부 연동 플로우

```
[구글시트] → GAS 웹훅 → POST /api/ingest/sheet → 파싱 → 등록/연장/환불
[Tally 설문] → 웹훅 → POST /api/ingest/tally → 문자 발송
[Vercel Cron] → GET /api/cron/session-status (매일 00:05 KST) → 상태 전환
[Vercel Cron] → GET /api/cron/reminder (매일 18:00 KST) → 리마인더 문자
```

---

## 주의사항

- API 캐시 완전 비활성화됨 (`next.config.mjs` + `vercel.json`)
- 클라이언트 컴포넌트가 큼 (15~40KB) - 분리 고려 필요
- `HANDOVER.md`에 실제 API 키 포함 - 보안 주의
- Supabase 마이그레이션은 MCP가 아닌 SQL 파일로 직접 관리 중
- 세션 4주 = end_date에서 -6일이 실제 마지막 수업일
