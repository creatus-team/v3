/**
 * RCCC - Google Apps Script
 * 구글시트 결제 데이터 → 서버 웹훅 전송
 * 
 * 설정 방법:
 * 1. 구글시트에서 확장프로그램 > Apps Script
 * 2. 이 코드 붙여넣기
 * 3. WEBHOOK_URL, WEBHOOK_SECRET_TOKEN 설정
 * 4. 트리거 설정: 편집 > 현재 프로젝트의 트리거 > onEdit or onChange
 */

// ===== 설정 =====
const CONFIG = {
  // Vercel 배포 URL (예: https://your-app.vercel.app)
  WEBHOOK_URL: 'https://your-vercel-app.vercel.app/api/ingest/sheet',
  
  // 웹훅 인증 토큰 (서버의 WEBHOOK_SECRET_TOKEN과 동일해야 함)
  WEBHOOK_SECRET_TOKEN: 'your-secret-token-here',
  
  // 시트 이름 (탭 이름)
  NEW_PAYMENT_SHEET: '신규결제',  // 신규 결제 시트 이름
  RENEWAL_SHEET: '재결제',         // 재결제 시트 이름
  
  // 처리 완료 표시 컬럼 (선택사항)
  PROCESSED_COLUMN: '서버전송',   // 이 컬럼이 있으면 중복 전송 방지
};

// ===== 메인 함수 =====

/**
 * 시트 변경 시 자동 호출 (트리거 설정 필요)
 */
function onEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    
    // 신규결제 또는 재결제 시트인지 확인
    if (sheetName !== CONFIG.NEW_PAYMENT_SHEET && sheetName !== CONFIG.RENEWAL_SHEET) {
      return;
    }
    
    const row = e.range.getRow();
    
    // 헤더 행은 무시
    if (row <= 1) return;
    
    // 해당 행 데이터 전송
    sendRowToServer(sheet, row);
  } catch (error) {
    Logger.log('onEdit 오류: ' + error.message);
  }
}

/**
 * 수동 실행: 특정 행 전송
 */
function sendSpecificRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = SpreadsheetApp.getActiveSpreadsheet().getActiveRange().getRow();
  sendRowToServer(sheet, row);
}

/**
 * 수동 실행: 전체 미처리 행 전송
 */
function sendAllPendingRows() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // 신규결제 시트
  const newSheet = spreadsheet.getSheetByName(CONFIG.NEW_PAYMENT_SHEET);
  if (newSheet) {
    processSheet(newSheet);
  }
  
  // 재결제 시트
  const renewalSheet = spreadsheet.getSheetByName(CONFIG.RENEWAL_SHEET);
  if (renewalSheet) {
    processSheet(renewalSheet);
  }
}

/**
 * 시트의 모든 미처리 행 전송
 */
function processSheet(sheet) {
  const lastRow = sheet.getLastRow();
  const headers = getHeaders(sheet);
  const processedColIndex = headers.indexOf(CONFIG.PROCESSED_COLUMN);
  
  for (let row = 2; row <= lastRow; row++) {
    // 이미 처리된 행은 건너뛰기
    if (processedColIndex !== -1) {
      const processed = sheet.getRange(row, processedColIndex + 1).getValue();
      if (processed === 'Y' || processed === '완료') {
        continue;
      }
    }
    
    sendRowToServer(sheet, row);
    
    // API 호출 제한 방지
    Utilities.sleep(500);
  }
}

// ===== 핵심 함수 =====

/**
 * 특정 행 데이터를 서버로 전송
 */
function sendRowToServer(sheet, row) {
  try {
    const headers = getHeaders(sheet);
    const rowData = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    
    // 빈 행 체크
    if (!rowData[0] && !rowData[1]) {
      Logger.log('빈 행 무시: ' + row);
      return;
    }
    
    // 헤더 이름으로 매핑
    const payload = {};
    headers.forEach((header, index) => {
      if (header && rowData[index] !== undefined && rowData[index] !== null) {
        payload[header] = formatValue(rowData[index]);
      }
    });
    
    // 메타 정보 추가
    payload._sheetName = sheet.getName();
    payload._row = row;
    payload._timestamp = new Date().toISOString();
    
    // 서버로 전송
    const response = sendWebhook(payload);
    
    if (response.success) {
      Logger.log('전송 성공: Row ' + row);
      markAsProcessed(sheet, row, headers);
    } else {
      Logger.log('전송 실패: Row ' + row + ' - ' + response.error);
    }
    
  } catch (error) {
    Logger.log('sendRowToServer 오류: ' + error.message);
  }
}

/**
 * 웹훅 HTTP 요청
 */
function sendWebhook(payload) {
  try {
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-RCCC-Token': CONFIG.WEBHOOK_SECRET_TOKEN,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };
    
    const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (statusCode >= 200 && statusCode < 300) {
      return { success: true, data: JSON.parse(responseText) };
    } else {
      return { success: false, error: `HTTP ${statusCode}: ${responseText}` };
    }
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ===== 유틸리티 함수 =====

/**
 * 시트 헤더 가져오기
 */
function getHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

/**
 * 값 포맷팅 (날짜, 숫자 등)
 */
function formatValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");
  }
  return value;
}

/**
 * 처리 완료 표시
 */
function markAsProcessed(sheet, row, headers) {
  const processedColIndex = headers.indexOf(CONFIG.PROCESSED_COLUMN);
  if (processedColIndex !== -1) {
    sheet.getRange(row, processedColIndex + 1).setValue('Y');
  }
}

// ===== 테스트 함수 =====

/**
 * 연결 테스트
 */
function testConnection() {
  const testPayload = {
    _test: true,
    _timestamp: new Date().toISOString(),
  };
  
  const result = sendWebhook(testPayload);
  Logger.log('테스트 결과: ' + JSON.stringify(result));
  
  if (result.success) {
    SpreadsheetApp.getUi().alert('✅ 연결 성공!\n\n서버와 정상적으로 통신됩니다.');
  } else {
    SpreadsheetApp.getUi().alert('❌ 연결 실패\n\n' + result.error);
  }
}

/**
 * 설정 확인
 */
function checkConfig() {
  const issues = [];
  
  if (!CONFIG.WEBHOOK_URL || CONFIG.WEBHOOK_URL.includes('your-')) {
    issues.push('❌ WEBHOOK_URL이 설정되지 않았습니다.');
  }
  
  if (!CONFIG.WEBHOOK_SECRET_TOKEN || CONFIG.WEBHOOK_SECRET_TOKEN.includes('your-')) {
    issues.push('❌ WEBHOOK_SECRET_TOKEN이 설정되지 않았습니다.');
  }
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet.getSheetByName(CONFIG.NEW_PAYMENT_SHEET)) {
    issues.push('⚠️ "' + CONFIG.NEW_PAYMENT_SHEET + '" 시트를 찾을 수 없습니다.');
  }
  
  if (!spreadsheet.getSheetByName(CONFIG.RENEWAL_SHEET)) {
    issues.push('⚠️ "' + CONFIG.RENEWAL_SHEET + '" 시트를 찾을 수 없습니다.');
  }
  
  if (issues.length === 0) {
    SpreadsheetApp.getUi().alert('✅ 설정 확인 완료!\n\n모든 설정이 올바릅니다.');
  } else {
    SpreadsheetApp.getUi().alert('설정 확인 결과:\n\n' + issues.join('\n'));
  }
}

// ===== 메뉴 추가 =====

/**
 * 시트 열 때 커스텀 메뉴 추가
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 RCCC')
    .addItem('📤 선택한 행 전송', 'sendSpecificRow')
    .addItem('📤 전체 미처리 행 전송', 'sendAllPendingRows')
    .addSeparator()
    .addItem('🔗 연결 테스트', 'testConnection')
    .addItem('⚙️ 설정 확인', 'checkConfig')
    .addToUi();
}
