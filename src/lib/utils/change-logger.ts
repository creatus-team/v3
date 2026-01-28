// lib/utils/change-logger.ts
import { getServerClient } from '@/lib/supabase/server';

interface ChangeLogEntry {
  tableName: string;
  recordId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * 변경 이력을 기록합니다.
 * 
 * @param entries - 변경 내역 배열
 */
export async function logChanges(entries: ChangeLogEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const supabase = getServerClient();

  const logs = entries.map(entry => ({
    table_name: entry.tableName,
    record_id: entry.recordId,
    field_name: entry.fieldName,
    old_value: entry.oldValue !== undefined ? String(entry.oldValue) : null,
    new_value: entry.newValue !== undefined ? String(entry.newValue) : null,
  }));

  const { error } = await supabase.from('change_logs').insert(logs);

  if (error) {
    console.error('변경 이력 기록 실패:', error);
  }
}

/**
 * 두 객체를 비교하여 변경된 필드들을 추출합니다.
 * 
 * @param tableName - 테이블 이름
 * @param recordId - 레코드 ID
 * @param oldData - 이전 데이터
 * @param newData - 새 데이터
 * @param fields - 비교할 필드 목록 (없으면 newData의 모든 키)
 * @returns 변경 내역 배열
 */
export function compareAndGetChanges(
  tableName: string,
  recordId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  fields?: string[]
): ChangeLogEntry[] {
  const entries: ChangeLogEntry[] = [];
  const fieldsToCheck = fields || Object.keys(newData);

  for (const field of fieldsToCheck) {
    const oldValue = oldData[field];
    const newValue = newData[field];

    // 값이 실제로 변경된 경우만 기록
    if (newValue !== undefined && String(oldValue) !== String(newValue)) {
      entries.push({
        tableName,
        recordId,
        fieldName: field,
        oldValue,
        newValue,
      });
    }
  }

  return entries;
}

/**
 * 데이터 수정과 함께 변경 이력을 기록합니다.
 * 
 * @param tableName - 테이블 이름
 * @param recordId - 레코드 ID
 * @param oldData - 이전 데이터
 * @param newData - 새 데이터
 */
export async function logDataChange(
  tableName: string,
  recordId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>
): Promise<void> {
  const changes = compareAndGetChanges(tableName, recordId, oldData, newData);
  await logChanges(changes);
}
