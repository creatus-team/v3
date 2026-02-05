// lib/webhook-auth.ts

/**
 * 웹훅 요청의 토큰을 검증합니다.
 * - X-RCCC-Token 헤더 (V2 방식)
 * - Authorization: Bearer 헤더 (V3 방식)
 */
export function verifyWebhookToken(req: Request): boolean {
  const expectedToken = process.env.WEBHOOK_SECRET_TOKEN;
  
  // V2 방식: X-RCCC-Token 헤더
  const xToken = req.headers.get('X-RCCC-Token');
  if (xToken === expectedToken) {
    return true;
  }
  
  // V3 방식: Authorization: Bearer 헤더
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const bearerToken = authHeader.replace('Bearer ', '');
    if (bearerToken === expectedToken) {
      return true;
    }
  }
  
  return false;
}

/**
 * 크론잡 요청의 시크릿을 검증합니다.
 */
export function verifyCronSecret(req: Request): boolean {
  const secret = req.headers.get('X-Cron-Secret');
  
  // Vercel Cron의 경우 CRON_SECRET 헤더로도 검증
  const vercelAuth = req.headers.get('Authorization');
  const vercelSecret = vercelAuth?.replace('Bearer ', '');
  
  const expectedSecret = process.env.CRON_SECRET;
  
  return secret === expectedSecret || vercelSecret === expectedSecret;
}
