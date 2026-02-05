// app/api/inbox/tally-match/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { INBOX_STATUS, EVENT_TYPE, LOG_PROCESS_STATUS } from '@/lib/constants';
import { sendTallyApplicationMessages, sendTallyDiagnosisMessages } from '@/lib/sms';

export const dynamic = 'force-dynamic';

// Tally 수동 매칭 및 문자 발송
export async function POST(req: Request) {
  const supabase = getServerClient();

  try {
    const body = await req.json();
    const { inboxId, userId, sessionId } = body;

    if (!inboxId || !userId) {
      return NextResponse.json({ error: '인박스 ID와 사용자 ID가 필요합니다.' }, { status: 400 });
    }

    // 1. 인박스 항목 조회
    const { data: inboxItem, error: inboxError } = await supabase
      .from('ingestion_inbox')
      .select('*')
      .eq('id', inboxId)
      .single();

    if (inboxError || !inboxItem) {
      return NextResponse.json({ error: '인박스 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 2. 메타데이터에서 폼 타입 확인
    const metadata = inboxItem.metadata || {};
    const formType = metadata.formType || 'APPLICATION';

    // 3. 사용자 정보 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 4. 세션 조회 (sessionId가 있으면 직접, 없으면 최신 활성 세션)
    let session;
    if (sessionId) {
      const { data: directSession, error: sessionError } = await supabase
        .from('sessions')
        .select('*, coach:coaches(id, name, phone), slot:coach_slots(open_chat_link)')
        .eq('id', sessionId)
        .single();

      if (sessionError || !directSession) {
        return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
      }
      session = directSession;
    } else {
      const { data: latestSession, error: sessionError } = await supabase
        .from('sessions')
        .select('*, coach:coaches(id, name, phone), slot:coach_slots(open_chat_link)')
        .eq('user_id', userId)
        .in('status', ['ACTIVE', 'PENDING'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (sessionError || !latestSession) {
        return NextResponse.json({ error: '활성 세션을 찾을 수 없습니다.' }, { status: 404 });
      }
      session = latestSession;
    }

    // 5. 코치 정보 추출
    const coach = Array.isArray(session.coach) ? session.coach[0] : session.coach;
    const slot = Array.isArray(session.slot) ? session.slot[0] : session.slot;
    const openChatLink = slot?.open_chat_link || '';

    if (!coach) {
      return NextResponse.json({ error: '코치 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 6. 문자 발송
    try {
      if (formType === 'APPLICATION') {
        await sendTallyApplicationMessages(
          { name: user.name, phone: user.phone },
          { name: coach.name, phone: coach.phone }
        );
      } else if (formType === 'DIAGNOSIS') {
        await sendTallyDiagnosisMessages(
          { name: user.name, phone: user.phone },
          { name: coach.name, phone: coach.phone },
          openChatLink
        );
      }
    } catch (smsError) {
      console.error('Tally 문자 발송 실패:', smsError);
      return NextResponse.json({ error: '문자 발송에 실패했습니다.' }, { status: 500 });
    }

    // 7. 인박스 상태 업데이트
    await supabase
      .from('ingestion_inbox')
      .update({ 
        manual_resolution_status: INBOX_STATUS.RESOLVED,
        metadata: {
          ...metadata,
          resolvedAt: new Date().toISOString(),
          matchedUserId: userId,
          matchedUserName: user.name,
          matchedUserPhone: user.phone,
        },
      })
      .eq('id', inboxId);

    // 8. 시스템 로그
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.SMS_SENT,
      status: 'SUCCESS',
      message: `Tally ${formType} 수동 매칭 완료: ${user.name} (${user.phone})`,
      process_status: LOG_PROCESS_STATUS.SUCCESS,
    });

    return NextResponse.json({
      success: true,
      message: `${user.name}님에게 Tally ${formType === 'APPLICATION' ? '코칭신청서' : '사전진단'} 문자가 발송되었습니다.`,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
      },
      coach: {
        name: coach.name,
      },
    });

  } catch (error) {
    console.error('Tally 수동 매칭 오류:', error);
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
