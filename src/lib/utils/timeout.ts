// lib/utils/timeout.ts

/**
 * Promise에 타임아웃을 적용합니다.
 * 지정된 시간 내에 완료되지 않으면 에러를 던집니다.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage = 'Timeout'
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * 지정된 시간만큼 대기합니다.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
