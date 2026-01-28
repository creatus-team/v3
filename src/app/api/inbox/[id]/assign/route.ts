// app/api/inbox/[id]/assign/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone-normalizer';
import { calculateStartDate, calculateEndDate } from '@/lib/utils/date-calculator';
import { SESSION_STATUS, ACTION_TYPE, EVENT_TYPE, LOG_PROCESS_STATUS, INBOX_STATUS } from '@/lib/constants';
import type { DayOfWeek } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// 수동 배정 (슬롯 충돌 시 다른 슬롯 선택)
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const inboxId = params.id;

  try {
    const body = await req.json();
    const { slotId } = body;

    if (!slotId) {
      return NextResponse.json({ error: '슬롯을 선택해주세요.' }, { status: 400 });
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

    // 2. 원본 웹훅 데이터에서 정보 추출
    const payload = inboxItem.raw_webhook?.payload;
    if (!payload) {
      return NextResponse.json({ error: '원본 데이터가 없습니다.' }, { status: 400 });
    }

    const phone = payload['전화번호'] || payload.phone;
    const userName = payload['이름'] || payload.name || '이름없음';
    const userEmail = payload['이메일'] || payload.email || null;
    const paymentAmount = payload['결제금액'] || payload.amount;
    const paymentDateTime = payload['일시'] || payload.timestamp;
    const productName = payload['상품명'] || payload.product || '래피드코칭 4회';

    // 3. 슬롯 조회
    const { data: slot, error: slotError } = await supabase
      .from('coach_slots')
      .select('*, coach:coaches(*)')
      .eq('id', slotId)
      .single();

    if (slotError || !slot) {
      return NextResponse.json({ error: '슬롯을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 4. 슬롯 충돌 체크
    const { data: existingSession } = await supabase
      .from('sessions')
      .select('id')
      .eq('slot_id', slotId)
      .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING])
      .single();

    if (existingSession) {
      return NextResponse.json({ error: '선택한 슬롯에 이미 수강생이 있습니다.' }, { status: 400 });
    }

    // 5. 수강생 찾기 또는 생성
    const normalizedPhone = normalizePhone(String(phone));
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    if (!user) {
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          name: String(userName),
          phone: normalizedPhone,
          email: userEmail ? String(userEmail) : null,
        })
        .select()
        .single();

      if (userError) {
        return NextResponse.json({ error: '수강생 생성에 실패했습니다.' }, { status: 500 });
      }
      user = newUser;
    }

    // 6. 날짜 계산
    const startDate = calculateStartDate(slot.day_of_week as DayOfWeek);
    const endDate = calculateEndDate(startDate);
    const paymentDate = paymentDateTime ? String(paymentDateTime).split('T')[0] : startDate;

    // 7. 세션 생성
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
        payment_amount: paymentAmount ? parseInt(String(paymentAmount).replace(/[^0-9]/g, '')) : null,
        payment_date: paymentDate,
        product_name: String(productName),
      })
      .select()
      .single();

    if (sessionError) {
      return NextResponse.json({ error: '세션 생성에 실패했습니다.' }, { status: 500 });
    }

    // 8. 활동 로그 기록
    await supabase.from('user_activity_logs').insert({
      user_id: user.id,
      session_id: session.id,
      action_type: ACTION_TYPE.ENROLL,
      reason: '인박스 수동 배정',
      metadata: {
        inboxId,
        originalSlot: inboxItem.raw_text,
        assignedSlot: `${slot.coach?.name}/${slot.day_of_week}/${slot.start_time}`,
      },
    });

    // 9. 인박스 처리 완료
    await supabase
      .from('ingestion_inbox')
      .update({ manual_resolution_status: INBOX_STATUS.RESOLVED })
      .eq('id', inboxId);

    // 10. Raw 웹훅 처리 완료
    if (inboxItem.raw_webhook_id) {
      await supabase
        .from('raw_webhooks')
        .update({ processed: true })
        .eq('id', inboxItem.raw_webhook_id);
    }

    // 11. 시스템 로그
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.SESSION_CREATED,
      status: 'SUCCESS',
      message: `수동 배정 완료: ${user.name} → ${slot.coach?.name}/${slot.day_of_week}/${slot.start_time}`,
      process_status: LOG_PROCESS_STATUS.SUCCESS,
    });

    return NextResponse.json({
      success: true,
      message: '수동 배정이 완료되었습니다.',
      data: { sessionId: session.id },
    });
  } catch (error) {
    console.error('수동 배정 오류:', error);
    return NextResponse.json({ error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
