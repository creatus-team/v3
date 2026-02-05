// app/api/inbox/assign/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { normalizePhone, isValidPhone } from '@/lib/utils/phone-normalizer';
import { calculateStartDate, calculateEndDate } from '@/lib/utils/date-calculator';
import { SESSION_STATUS, ACTION_TYPE, INBOX_STATUS, DayOfWeek } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// 인박스 항목을 다른 슬롯에 수동 배정
export async function POST(req: Request) {
  const supabase = getServerClient();

  try {
    const body = await req.json();
    const { inboxId, slotId, userName, userPhone, paymentAmount } = body;

    if (!inboxId || !slotId) {
      return NextResponse.json({ error: '인박스 ID와 슬롯 ID가 필요합니다.' }, { status: 400 });
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

    // 2. 슬롯 조회
    const { data: slot, error: slotError } = await supabase
      .from('coach_slots')
      .select('*, coach:coaches(*)')
      .eq('id', slotId)
      .single();

    if (slotError || !slot) {
      return NextResponse.json({ error: '슬롯을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 3. 슬롯 충돌 체크
    const { data: existingSession } = await supabase
      .from('sessions')
      .select('id')
      .eq('slot_id', slotId)
      .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING])
      .single();

    if (existingSession) {
      return NextResponse.json({ error: '해당 슬롯에 이미 수강생이 있습니다.' }, { status: 400 });
    }

    // 4. 수강생 정보 추출 (원본 웹훅 또는 입력값)
    const rawPayload = inboxItem.raw_webhook?.payload || {};
    const name = userName || rawPayload['이름'] || rawPayload.name || '이름없음';
    const phone = userPhone || rawPayload['전화번호'] || rawPayload.phone || '';
    const normalizedPhone = normalizePhone(String(phone));

    if (!isValidPhone(normalizedPhone)) {
      return NextResponse.json({ error: '유효하지 않은 전화번호입니다.' }, { status: 400 });
    }

    // 5. 수강생 찾기 또는 생성
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    if (!user) {
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          name: String(name),
          phone: normalizedPhone,
        })
        .select()
        .single();

      if (userError) {
        return NextResponse.json({ error: '수강생 생성에 실패했습니다.' }, { status: 500 });
      }
      user = newUser;
    }

    // 6. 세션 생성
    const startDate = calculateStartDate(slot.day_of_week as DayOfWeek);
    const endDate = calculateEndDate(startDate);
    const amount = paymentAmount || rawPayload['결제금액'] || rawPayload.amount;

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        coach_id: slot.coach_id,
        slot_id: slot.id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        start_date: startDate,
        end_date: endDate,
        status: SESSION_STATUS.PENDING,
        payment_amount: amount ? parseInt(String(amount).replace(/[^0-9]/g, '')) : null,
      })
      .select()
      .single();

    if (sessionError) {
      return NextResponse.json({ error: '세션 생성에 실패했습니다.' }, { status: 500 });
    }

    // 7. 활동 로그 기록
    await supabase.from('user_activity_logs').insert({
      user_id: user.id,
      session_id: session.id,
      action_type: ACTION_TYPE.ENROLL,
      reason: '인박스 수동 배정',
      metadata: {
        inboxId,
        coach: slot.coach?.name,
        slot: `${slot.day_of_week} ${slot.start_time}`,
      },
    });

    // 8. 인박스 상태 변경
    await supabase
      .from('ingestion_inbox')
      .update({ manual_resolution_status: INBOX_STATUS.RESOLVED })
      .eq('id', inboxId);

    // 9. raw_webhook 처리 완료
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
        message: `${user.name}님이 ${slot.coach?.name}/${slot.day_of_week}/${slot.start_time} 슬롯에 배정되었습니다.`,
      },
    });
  } catch (error) {
    console.error('수동 배정 오류:', error);
    return NextResponse.json({ error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
