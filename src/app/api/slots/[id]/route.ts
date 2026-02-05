// app/api/slots/[id]/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import dayjs from '@/lib/dayjs';
import { sendSlotChangeMessages } from '@/lib/sms';

export const dynamic = 'force-dynamic';

// 슬롯 수정
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const slotId = params.id;

  try {
    const body = await req.json();
    const { dayOfWeek, startTime, openChatLink, isActive } = body;

    // 현재 슬롯 정보 조회 (변경 전)
    const { data: currentSlot } = await supabase
      .from('coach_slots')
      .select('*, coach:coaches(id, name, phone)')
      .eq('id', slotId)
      .single();

    if (!currentSlot) {
      return NextResponse.json({ success: false, error: '슬롯을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 비활성화하려는 경우, 수강생이 있는지 체크
    if (isActive === false) {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('slot_id', slotId)
        .in('status', ['ACTIVE', 'PENDING'])
        .limit(1);

      if (sessions && sessions.length > 0) {
        return NextResponse.json({ 
          success: false, 
          error: '수강생이 있는 슬롯은 비활성화할 수 없습니다.' 
        }, { status: 400 });
      }
    }

    // 시간 변경 여부 확인
    const isTimeChanged = (dayOfWeek && dayOfWeek !== currentSlot.day_of_week) || 
                          (startTime && startTime !== currentSlot.start_time?.slice(0, 5));

    // 종료 시간 계산 (40분 뒤)
    const endTime = startTime ? dayjs(`2000-01-01 ${startTime}`).add(40, 'minute').format('HH:mm') : undefined;

    const updateData: Record<string, string | boolean | null> = {};
    
    if (dayOfWeek) updateData.day_of_week = dayOfWeek;
    if (startTime) {
      updateData.start_time = startTime;
      updateData.end_time = endTime || null;
    }
    if (openChatLink !== undefined) updateData.open_chat_link = openChatLink || null;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { error } = await supabase
      .from('coach_slots')
      .update(updateData)
      .eq('id', slotId);

    if (error) {
      console.error('슬롯 수정 실패:', error);
      return NextResponse.json({ success: false, error: '슬롯 수정에 실패했습니다.' }, { status: 500 });
    }

    // 슬롯 시간이 변경된 경우, 연결된 세션들도 업데이트
    if (isTimeChanged) {
      const sessionUpdateData: Record<string, string> = {};
      if (dayOfWeek) sessionUpdateData.day_of_week = dayOfWeek;
      if (startTime) sessionUpdateData.start_time = startTime;

      if (Object.keys(sessionUpdateData).length > 0) {
        await supabase
          .from('sessions')
          .update(sessionUpdateData)
          .eq('slot_id', slotId)
          .in('status', ['ACTIVE', 'PENDING']);
      }
    }

    // 시간이 변경된 경우 문자 발송
    if (isTimeChanged) {
      // 해당 슬롯의 활성 세션 조회
      const { data: activeSessions } = await supabase
        .from('sessions')
        .select('*, user:users(id, name, phone)')
        .eq('slot_id', slotId)
        .in('status', ['ACTIVE', 'PENDING']);

      const oldSlot = { dayOfWeek: currentSlot.day_of_week, startTime: currentSlot.start_time?.slice(0, 5) || '' };
      const newSlot = { dayOfWeek: dayOfWeek || currentSlot.day_of_week, startTime: startTime || currentSlot.start_time?.slice(0, 5) || '' };

      // 수강생들에게 문자 발송
      for (const session of activeSessions || []) {
        if (session.user?.phone) {
          await sendSlotChangeMessages(
            { name: session.user.name, phone: session.user.phone },
            { name: currentSlot.coach?.name || '', phone: currentSlot.coach?.phone },
            oldSlot,
            newSlot
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('슬롯 수정 오류:', error);
    return NextResponse.json({ success: false, error: '오류가 발생했습니다.' }, { status: 500 });
  }
}

// 슬롯 삭제
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const slotId = params.id;

  try {
    // 해당 슬롯에 활성 세션이 있는지 확인
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('slot_id', slotId)
      .in('status', ['ACTIVE', 'PENDING'])
      .limit(1);

    if (sessions && sessions.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: '수강생이 있는 슬롯은 삭제할 수 없습니다.' 
      }, { status: 400 });
    }

    const { error } = await supabase
      .from('coach_slots')
      .delete()
      .eq('id', slotId);

    if (error) {
      console.error('슬롯 삭제 실패:', error);
      return NextResponse.json({ success: false, error: '슬롯 삭제에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('슬롯 삭제 오류:', error);
    return NextResponse.json({ success: false, error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
