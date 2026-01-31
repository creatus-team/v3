// lib/utils/excel-export.ts
import * as XLSX from 'xlsx';

interface ExportOptions {
  filename: string;
  sheetName?: string;
}

/**
 * 데이터를 엑셀 파일로 변환하여 다운로드
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  options: ExportOptions
): void {
  const { filename, sheetName = 'Sheet1' } = options;

  // 워크시트 생성
  const worksheet = XLSX.utils.json_to_sheet(data);

  // 워크북 생성
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // 파일 다운로드
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * 정산 데이터 엑셀 내보내기
 */
export function exportSettlement(
  data: {
    coachName: string;
    grade: string;
    sessions: number;
    pricePerSession: number;
    total: number;
  }[],
  year: number,
  month: number
): void {
  const exportData = data.map(item => ({
    '코치명': item.coachName,
    '등급': item.grade === 'TRAINEE' ? '견습' : item.grade === 'SENIOR' ? '선임' : '정식',
    '코칭횟수': item.sessions,
    '단가': item.pricePerSession.toLocaleString() + '원',
    '지급액': item.total.toLocaleString() + '원',
  }));

  // 합계 행 추가
  const totalSessions = data.reduce((sum, item) => sum + item.sessions, 0);
  const totalAmount = data.reduce((sum, item) => sum + item.total, 0);
  
  exportData.push({
    '코치명': '합계',
    '등급': '',
    '코칭횟수': totalSessions,
    '단가': '',
    '지급액': totalAmount.toLocaleString() + '원',
  });

  exportToExcel(exportData, {
    filename: `${year}년_${month}월_정산`,
    sheetName: `${year}년 ${month}월`,
  });
}

/**
 * 수강생 목록 엑셀 내보내기
 */
export function exportStudents(
  data: {
    name: string;
    phone: string;
    email?: string;
    coachName?: string;
    dayOfWeek?: string;
    startTime?: string;
    status: string;
    startDate?: string;
    endDate?: string;
  }[]
): void {
  const statusMap: Record<string, string> = {
    'ACTIVE': '수강중',
    'PENDING': '대기',
    'EXPIRED': '종료',
    'CANCELLED': '취소',
    'REFUNDED': '환불',
  };

  const exportData = data.map(item => ({
    '이름': item.name,
    '전화번호': item.phone,
    '이메일': item.email || '',
    '코치': item.coachName || '',
    '요일': item.dayOfWeek || '',
    '시간': item.startTime?.slice(0, 5) || '',
    '상태': statusMap[item.status] || item.status,
    '시작일': item.startDate || '',
    '종료일': item.endDate || '',
  }));

  const today = new Date().toISOString().slice(0, 10);
  exportToExcel(exportData, {
    filename: `수강생목록_${today}`,
    sheetName: '수강생',
  });
}

/**
 * 메시지 로그 엑셀 내보내기
 */
export function exportMessageLogs(
  data: {
    createdAt: string;
    eventType: string;
    status: string;
    message: string;
    recipient?: string;
  }[]
): void {
  const exportData = data.map(item => ({
    '일시': item.createdAt,
    '이벤트': item.eventType,
    '상태': item.status,
    '내용': item.message,
    '수신자': item.recipient || '',
  }));

  const today = new Date().toISOString().slice(0, 10);
  exportToExcel(exportData, {
    filename: `메시지로그_${today}`,
    sheetName: '로그',
  });
}
