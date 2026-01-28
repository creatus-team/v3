// app/api/slots/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { calculateEndTime } from '@/lib/utils/option-parser';
import { SESSION_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 슬롯 목록 조회
export async function GET(req: Request) {
  const supabase = getServerClient();
  const { searchParams } = new URL(req.url);
  
  const coachId = searchParams.get('coachId');
  const onlyAvailable = searchParams.get('available') === 'true';
  
  try {
    let query = supabase
      .from('coach_slots')
      .select(`
        *,
        coach:coaches(id, name, grade),
        sessions:sessions(
          id,
          user_id,
          status,
          start_date,
          end_date,
          user:users(id, name, phone)
        )
      `)
      .eq('is_active', true)
      .order('day_of_week')
      .order('start_time');

    if (coachId) {
      query = query.eq('coach_id', coachId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('슬롯 조회 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 현재 세션 계산
    const slotsWithCurrentSession = data?.map(slot => {
      const activeSessions = slot.sessions?.filter(
        (s: { status: string }) => s.status === SESSION_STATUS.ACTIVE || s.status === SESSION_STATUS.PENDING
      );
      const currentSession = activeSessions?.[0] || null;
      
      return {
        ...slot,
        currentSession,
        isEmpty: !currentSession,
      };
    });

    // 빈 슬롯만 필터링
    const result = onlyAvailable 
      ? slotsWithCurrentSession?.filter(s => s.isEmpty)
      : slotsWithCurrentSession;

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 슬롯 추가
export async function POST(req: Request) {
  const supabase = getServerClient();
  
  try {
    const body = await req.json();
    const { coachId, dayOfWeek, startTime, openChatLink } = body;

    if (!coachId || !dayOfWeek || !startTime) {
      return NextResponse.json({ error: '필수 필드가 누락되었습니다' }, { status: 400 });
    }

    // 종료 시간 계산 (시작 + 40분)
    const endTime = calculateEndTime(startTime);

    const { data, error } = await supabase
      .from('coach_slots')
      .insert({
        coach_id: coachId,
        day_of_week: dayOfWeek,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        open_chat_link: openChatLink || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 같은 시간에 슬롯이 존재합니다' }, { status: 400 });
      }
      console.error('슬롯 추가 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
