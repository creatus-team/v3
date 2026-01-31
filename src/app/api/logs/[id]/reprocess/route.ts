// app/api/logs/[id]/reprocess/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { EVENT_TYPE, LOG_PROCESS_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// 웹훅 재처리
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const logId = params.id;

  try {
    // 1. 원본 로그 조회
    const { data: log, error: logError } = await supabase
      .from('system_logs')
      .select('*')
      .eq('id', logId)
      .single();

    if (logError || !log) {
      return NextResponse.json({ error: '로그를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 2. 웹훅 관련 로그인지 확인
    if (!log.event_type.includes('WEBHOOK') && !log.event_type.includes('PARSE')) {
      return NextResponse.json({ error: '웹훅/파싱 로그만 재처리할 수 있습니다.' }, { status: 400 });
    }

    // 3. raw_data가 있는지 확인
    if (!log.raw_data) {
      return NextResponse.json({ error: '원본 데이터가 없어 재처리할 수 없습니다.' }, { status: 400 });
    }

    // TODO: 실제 웹훅 재처리 로직
    // const response = await fetch('/api/ingest/sheet', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(log.raw_data),
    // });

    // 4. 재처리 로그 기록
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.WEBHOOK_REPROCESSED,
      status: 'PENDING',
      message: `웹훅 재처리 요청: ${log.message}`,
      process_status: LOG_PROCESS_STATUS.PENDING,
      raw_data: { original_log_id: logId, reprocess: true, original_data: log.raw_data },
    });

    // 5. 원본 로그 처리완료로 변경
    await supabase
      .from('system_logs')
      .update({ process_status: LOG_PROCESS_STATUS.RESOLVED })
      .eq('id', logId);

    return NextResponse.json({ success: true, message: '재처리 요청이 완료되었습니다.' });
  } catch (error) {
    console.error('재처리 오류:', error);
    return NextResponse.json({ error: '재처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
