# Google Apps Script (GAS) 설정 가이드

## 1. Apps Script 열기

1. 구글 시트 열기
2. **확장프로그램** > **Apps Script** 클릭
3. 새 프로젝트가 열림

## 2. 코드 붙여넣기

1. `Code.gs` 파일 내용 전체 복사
2. Apps Script 에디터에 붙여넣기
3. 기존 `function myFunction() {}` 삭제

## 3. 설정 변경

```javascript
const CONFIG = {
  // ✅ 여기 변경 필요!
  WEBHOOK_URL: 'https://v3-five-theta.vercel.app/api/ingest/sheet',
  WEBHOOK_SECRET_TOKEN: 'your-actual-secret-token',
  
  // 시트 이름 확인 (탭 이름과 동일해야 함)
  NEW_PAYMENT_SHEET: '신규결제',
  RENEWAL_SHEET: '재결제',
};
```

## 4. 트리거 설정

### 자동 전송 설정 (권장)

1. Apps Script 에디터 왼쪽 메뉴에서 **⏰ 트리거** 클릭
2. **+ 트리거 추가** 클릭
3. 설정:
   - 실행할 함수: `onEdit`
   - 이벤트 소스: 스프레드시트에서
   - 이벤트 유형: 수정 시
4. **저장** 클릭

### 권한 승인

처음 실행 시 Google 계정 권한 승인 필요:
1. "이 앱은 확인되지 않았습니다" → **고급** 클릭
2. **프로젝트명(으)로 이동** 클릭
3. **허용** 클릭

## 5. 테스트

1. 시트 새로고침 (F5)
2. 메뉴에 **🚀 RCCC** 나타남
3. **🚀 RCCC** > **🔗 연결 테스트** 클릭
4. "✅ 연결 성공!" 확인

## 6. 운영

### 자동 전송
- 시트에 새 행 추가/수정 시 자동으로 서버 전송

### 수동 전송
- **🚀 RCCC** > **📤 선택한 행 전송**: 현재 선택한 행만 전송
- **🚀 RCCC** > **📤 전체 미처리 행 전송**: 아직 전송 안 된 모든 행 전송

## 트러블슈팅

### "연결 실패" 오류
1. `WEBHOOK_URL` 확인 (https:// 포함)
2. `WEBHOOK_SECRET_TOKEN` 서버와 동일한지 확인
3. Vercel 배포 상태 확인

### "시트를 찾을 수 없습니다"
- 시트 탭 이름이 `CONFIG.NEW_PAYMENT_SHEET`, `CONFIG.RENEWAL_SHEET`와 정확히 일치하는지 확인

### 중복 전송 방지
- `서버전송` 컬럼 추가하면 자동으로 'Y' 표시됨
- 이미 'Y'인 행은 재전송되지 않음

## 시트 컬럼 구조

### 신규결제 시트
```
이름 | 이메일 | 전화번호 | 구매옵션 | 상태 | 결제금액 | 일시 | 결제방식 | 취소사유 | 서버전송
```

### 재결제 시트
```
이름 | 이메일 | 전화번호 | 구매옵션 | 상태 | 결제금액 | 일시 | 결제방식 | 취소사유 | 서버전송
```

### 구매옵션 형식
```
코치이름 / 요일 / 시작시간 ~ 종료시간
예: 김다혜 / 화요일 / 19:00 ~ 19:40
```

### 상태 컬럼
- 빈 값 또는 "결제 완료" → 정상 결제
- "결제 취소" → 환불 처리

## 환경변수 (Vercel)

서버측에서 설정 필요:
```
WEBHOOK_SECRET_TOKEN=your-actual-secret-token
```

GAS의 `CONFIG.WEBHOOK_SECRET_TOKEN`과 동일해야 함!
