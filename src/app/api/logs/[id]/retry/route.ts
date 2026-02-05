// app/api/logs/[id]/retry/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { EVENT_TYPE, LOG_PROCESS_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// 문자 재시도
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

    // 2. SMS 관련 로그인지 확인
    if (!log.event_type.includes('SMS')) {
      return NextResponse.json({ error: 'SMS 로그만 재시도할 수 있습니다.' }, { status: 400 });
    }

    // TODO: 실제 문자 재발송 로직 구현
    // const smsData = log.raw_data;
    // await sendSms(smsData.phone, smsData.message);

    // 3. 로그 상태 업데이트 (재시도 기록)
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.SMS_SENT,
      status: 'PENDING',
      message: `문자 재시도 요청: ${log.message}`,
      process_status: LOG_PROCESS_STATUS.PENDING,
      raw_data: { original_log_id: logId, retry: true },
    });

    // 4. 원본 로그 처리완료로 변경
    await supabase
      .from('system_logs')
      .update({ process_status: LOG_PROCESS_STATUS.RESOLVED })
      .eq('id', logId);

    return NextResponse.json({ success: true, message: '재시도 요청이 완료되었습니다.' });
  } catch (error) {
    console.error('재시도 오류:', error);
    return NextResponse.json({ error: '재시도 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
