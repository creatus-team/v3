// app/api/cron/session-status/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { verifyCronSecret } from '@/lib/webhook-auth';
import { getToday, getYesterday } from '@/lib/utils/date-calculator';
import { SESSION_STATUS, EVENT_TYPE, LOG_PROCESS_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = getServerClient();
  
  try {
    // 크론 시크릿 검증 (선택적)
    // if (!verifyCronSecret(req)) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const today = getToday();
    const yesterday = getYesterday();

    // 1. PENDING → ACTIVE (시작일이 오늘인 세션)
    const { data: activated, error: activateError } = await supabase
      .from('sessions')
      .update({ status: SESSION_STATUS.ACTIVE })
      .eq('status', SESSION_STATUS.PENDING)
      .lte('start_date', today)
      .select('id');

    if (activateError) {
      console.error('세션 활성화 오류:', activateError);
    }

    const activatedCount = activated?.length || 0;

    // 2. ACTIVE → EXPIRED (종료일이 어제인 세션)
    const { data: expired, error: expireError } = await supabase
      .from('sessions')
      .update({ status: SESSION_STATUS.EXPIRED })
      .eq('status', SESSION_STATUS.ACTIVE)
      .lt('end_date', today)
      .select('id');

    if (expireError) {
      console.error('세션 만료 오류:', expireError);
    }

    const expiredCount = expired?.length || 0;

    // 로그 기록
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.CRON_COMPLETED,
      status: 'SUCCESS',
      message: `세션 상태 전환 완료: ${activatedCount}건 활성화, ${expiredCount}건 만료`,
      process_status: LOG_PROCESS_STATUS.SUCCESS,
    });

    return NextResponse.json({ 
      success: true, 
      data: {
        activated: activatedCount,
        expired: expiredCount,
        date: today,
      }
    });
  } catch (error) {
    console.error('크론잡 오류:', error);
    
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.SYSTEM_ERROR,
      status: 'FAILED',
      message: '세션 상태 전환 크론잡 실패',
      error_detail: error instanceof Error ? error.message : String(error),
      process_status: LOG_PROCESS_STATUS.PENDING,
    });

    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}

// Vercel Cron에서 GET 요청으로도 동작하도록
export async function GET(req: Request) {
  return POST(req);
}
