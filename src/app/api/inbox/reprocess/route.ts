// app/api/inbox/reprocess/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { parseOption } from '@/lib/utils/option-parser';
import { normalizePhone, isValidPhone } from '@/lib/utils/phone-normalizer';
import { calculateStartDate, calculateEndDate } from '@/lib/utils/date-calculator';
import { 
  SESSION_STATUS, 
  ACTION_TYPE, 
  INBOX_STATUS, 
  EVENT_TYPE, 
  LOG_PROCESS_STATUS,
  DayOfWeek 
} from '@/lib/constants';

export const dynamic = 'force-dynamic';

// 인박스 항목 재처리 (원본 웹훅 데이터로 다시 시도)
export async function POST(req: Request) {
  const supabase = getServerClient();

  try {
    const body = await req.json();
    const { inboxId } = body;

    if (!inboxId) {
      return NextResponse.json({ error: '인박스 ID가 필요합니다.' }, { status: 400 });
    }

    // 1. 인박스 항목 조회
    const { data: inboxItem, error: inboxError } = await supabase
      .from('ingestion_inbox')
      .select('*, raw_webhook:raw_webhooks(*)')
      .eq('id', inboxId)
      .single();

    if (inboxError || !inboxItem) {
      return NextResponse.json({ error: '인박스 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const rawPayload = inboxItem.raw_webhook?.payload;
    if (!rawPayload) {
      return NextResponse.json({ error: '원본 웹훅 데이터가 없습니다.' }, { status: 400 });
    }

    // 2. 구매옵션 파싱
    const optionText = rawPayload['구매옵션'] || rawPayload.option || '';
    const parsed = parseOption(String(optionText));

    if (!parsed) {
      return NextResponse.json({ 
        error: '구매옵션 파싱 실패', 
        detail: `"${optionText}" 형식을 인식할 수 없습니다.` 
      }, { status: 400 });
    }

    // 3. 코치 찾기
    const { data: coach, error: coachError } = await supabase
      .from('coaches')
      .select('*')
      .eq('name', parsed.coach)
      .single();

    if (coachError || !coach) {
      return NextResponse.json({ 
        error: '코치를 찾을 수 없음', 
        detail: `"${parsed.coach}" 코치가 존재하지 않습니다.` 
      }, { status: 400 });
    }

    // 4. 슬롯 찾기
    const { data: slot, error: slotError } = await supabase
      .from('coach_slots')
      .select('*')
      .eq('coach_id', coach.id)
      .eq('day_of_week', parsed.day)
      .eq('start_time', `${parsed.time}:00`)
      .eq('is_active', true)
      .single();

    if (slotError || !slot) {
      return NextResponse.json({ 
        error: '슬롯을 찾을 수 없음', 
        detail: `${parsed.coach}/${parsed.day}/${parsed.time} 슬롯이 존재하지 않습니다.` 
      }, { status: 400 });
    }

    // 5. 슬롯 충돌 체크
    const { data: existingSession } = await supabase
      .from('sessions')
      .select('*, user:users(name)')
      .eq('slot_id', slot.id)
      .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING])
      .single();

    if (existingSession) {
      return NextResponse.json({ 
        error: '슬롯 충돌', 
        detail: `${parsed.coach}/${parsed.day}/${parsed.time} 슬롯에 ${existingSession.user?.name}님이 이미 수강 중입니다.` 
      }, { status: 400 });
    }

    // 6. 전화번호 정규화
    const phone = rawPayload['전화번호'] || rawPayload.phone;
    const normalizedPhone = normalizePhone(String(phone));
    
    if (!isValidPhone(normalizedPhone)) {
      return NextResponse.json({ 
        error: '유효하지 않은 전화번호', 
        detail: `"${phone}"` 
      }, { status: 400 });
    }

    // 7. 수강생 찾기 또는 생성
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    const userName = rawPayload['이름'] || rawPayload.name || '이름없음';

    if (!user) {
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          name: String(userName),
          phone: normalizedPhone,
        })
        .select()
        .single();

      if (userError) {
        return NextResponse.json({ error: '수강생 생성에 실패했습니다.' }, { status: 500 });
      }
      user = newUser;
    }

    // 8. 중복 세션 체크 (같은 user + 같은 slot에 ACTIVE/PENDING 세션 있는지)
    const { data: existingSessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('slot_id', slot.id)
      .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING]);

    if (existingSessions && existingSessions.length > 0) {
      return NextResponse.json({ 
        error: '중복 세션 존재', 
        detail: `이미 같은 슬롯에 진행중인 세션이 있습니다. (${existingSessions.length}개)` 
      }, { status: 400 });
    }

    // 9. 세션 생성
    const startDate = calculateStartDate(slot.day_of_week as DayOfWeek);
    const endDate = calculateEndDate(startDate);
    const paymentAmount = rawPayload['결제금액'] || rawPayload.amount;

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        coach_id: coach.id,
        slot_id: slot.id,
        day_of_week: parsed.day,
        start_time: `${parsed.time}:00`,
        start_date: startDate,
        end_date: endDate,
        status: SESSION_STATUS.PENDING,
        payment_amount: paymentAmount ? parseInt(String(paymentAmount).replace(/[^0-9]/g, '')) : null,
      })
      .select()
      .single();

    if (sessionError) {
      return NextResponse.json({ error: '세션 생성에 실패했습니다.' }, { status: 500 });
    }

    // 10. 활동 로그 기록
    await supabase.from('user_activity_logs').insert({
      user_id: user.id,
      session_id: session.id,
      action_type: ACTION_TYPE.ENROLL,
      reason: '인박스 재처리',
      metadata: {
        inboxId,
        coach: parsed.coach,
        slot: `${parsed.day} ${parsed.time}`,
      },
    });

    // 11. 시스템 로그
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.SESSION_CREATED,
      status: 'SUCCESS',
      message: `재처리 성공: ${user.name} → ${parsed.coach}/${parsed.day}/${parsed.time}`,
      process_status: LOG_PROCESS_STATUS.SUCCESS,
    });

    // 11. 인박스 상태 변경
    await supabase
      .from('ingestion_inbox')
      .update({ manual_resolution_status: INBOX_STATUS.RESOLVED })
      .eq('id', inboxId);

    // 12. raw_webhook 처리 완료
    if (inboxItem.raw_webhook_id) {
      await supabase
        .from('raw_webhooks')
        .update({ processed: true })
        .eq('id', inboxItem.raw_webhook_id);
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        userId: user.id,
        message: `재처리 완료: ${user.name}님이 ${parsed.coach}/${parsed.day}/${parsed.time}에 등록되었습니다.`,
      },
    });
  } catch (error) {
    console.error('재처리 오류:', error);
    return NextResponse.json({ error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
