// app/api/sms-logs/refresh/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { refreshSmsLogStatuses } from '@/lib/sms/solapi';

export const dynamic = 'force-dynamic';

// SENT 상태인 최근 로그들의 실제 상태 조회 및 업데이트
export async function POST(req: Request) {
  const supabase = getServerClient();

  try {
    const body = await req.json().catch(() => ({}));
    const { ids } = body; // 특정 ID들만 새로고침 (선택적)

    // 조회 대상: SENT 상태이고, provider_message_id가 있는 것
    let query = supabase
      .from('sms_logs')
      .select('id, provider_message_id')
      .eq('status', 'SENT')
      .not('provider_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50); // 최대 50개씩

    // 특정 ID들만 지정된 경우
    if (ids && Array.isArray(ids) && ids.length > 0) {
      query = supabase
        .from('sms_logs')
        .select('id, provider_message_id')
        .in('id', ids)
        .not('provider_message_id', 'is', null);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('sms_logs 조회 실패:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!logs || logs.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: '업데이트할 로그가 없습니다.',
        updated: 0,
      });
    }

    // 상태 업데이트
    const results = await refreshSmsLogStatuses(logs);

    // 결과 집계
    const summary = {
      total: logs.length,
      updated: results.length,
      delivered: results.filter(r => r.newStatus === 'DELIVERED').length,
      failed: results.filter(r => r.newStatus === 'FAILED').length,
    };

    return NextResponse.json({
      success: true,
      summary,
      details: results,
    });
  } catch (error) {
    console.error('상태 새로고침 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
