// app/api/sessions/today/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import dayjs from '@/lib/dayjs';
import { SESSION_STATUS, DAYS_ARRAY } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const supabase = getServerClient();
  
  try {
    const today = dayjs();
    const todayStr = today.format('YYYY-MM-DD');
    const todayDayIndex = today.day(); // 0(일) ~ 6(토)
    const todayDayOfWeek = DAYS_ARRAY[todayDayIndex === 0 ? 6 : todayDayIndex - 1];

    // 오늘 요일에 해당하는 ACTIVE 세션 조회
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        user:users(id, name, phone),
        coach:coaches(id, name),
        slot:coach_slots(id, start_time, end_time, open_chat_link),
        postponements(postponed_date)
      `)
      .eq('day_of_week', todayDayOfWeek)
      .eq('status', SESSION_STATUS.ACTIVE)
      .lte('start_date', todayStr)
      .gte('end_date', todayStr);

    if (error) {
      console.error('오늘의 수업 조회 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 연기된 날짜 필터링
    const todayLessons = data?.filter(session => {
      const postponedDates = session.postponements?.map((p: { postponed_date: string }) => p.postponed_date) || [];
      return !postponedDates.includes(todayStr);
    }).map(session => ({
      time: session.slot?.start_time?.slice(0, 5) || session.start_time?.slice(0, 5),
      coachName: session.coach?.name,
      studentName: session.user?.name,
      studentPhone: session.user?.phone,
      slotId: session.slot_id,
      sessionId: session.id,
    })).sort((a, b) => a.time.localeCompare(b.time)) || [];

    return NextResponse.json({ 
      success: true, 
      data: todayLessons,
      date: todayStr,
      dayOfWeek: todayDayOfWeek,
    });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
