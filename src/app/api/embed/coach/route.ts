// app/api/embed/coach/route.ts
// 코치 임베드 전용 API - service_role key로 조회 (RLS 무시)
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import dayjs from '@/lib/dayjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const supabase = getServerClient();
  const { searchParams } = new URL(req.url);

  const coachId = searchParams.get('coachId');
  const tab = searchParams.get('tab'); // 'today' | 'students' | 'slots' | 'student-detail'

  // student-detail은 coachId 불필요 (userId로만 조회)
  if (tab === 'student-detail') {
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    try {
      return await handleStudentDetail(supabase, userId);
    } catch (error) {
      console.error('임베드 API 오류:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  if (!coachId || !tab) {
    return NextResponse.json({ error: 'coachId and tab are required' }, { status: 400 });
  }

  try {
    switch (tab) {
      case 'today':
        return await handleToday(supabase, coachId);
      case 'students':
        return await handleStudents(supabase, coachId);
      case 'slots':
        return await handleSlots(supabase, coachId);
      default:
        return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });
    }
  } catch (error) {
    console.error('임베드 API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 오늘 수업 조회
async function handleToday(supabase: any, coachId: string) {
  const today = dayjs().tz('Asia/Seoul').format('YYYY-MM-DD');
  const todayDayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dayjs().tz('Asia/Seoul').day()];

  const dayIndexMap: Record<string, number> = {
    '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6
  };
  const todayDayIndex = dayIndexMap[todayDayOfWeek];

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select(`
      id,
      start_time,
      start_date,
      extension_count,
      user:users(name, phone),
      postponements(postponed_date)
    `)
    .eq('coach_id', coachId)
    .eq('day_of_week', todayDayOfWeek)
    .in('status', ['ACTIVE', 'PENDING'])
    .lte('start_date', today)
    .gte('end_date', today);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lessons = [];
  for (const session of (sessions || [])) {
    const postponedDates = session.postponements?.map((p: { postponed_date: string }) => p.postponed_date) || [];
    if (postponedDates.includes(today)) continue;

    const user = Array.isArray(session.user) ? session.user[0] : session.user;

    // completedLessons 계산 (dayjs 통일)
    let completedLessons = 0;
    const start = dayjs(session.start_date).tz('Asia/Seoul').startOf('day');
    const todayDate = dayjs().tz('Asia/Seoul').startOf('day');
    let check = start;
    while (check.isBefore(todayDate) || check.isSame(todayDate, 'day')) {
      if (check.day() === todayDayIndex) {
        const dateStr = check.format('YYYY-MM-DD');
        if (!postponedDates.includes(dateStr)) {
          completedLessons++;
        }
      }
      check = check.add(1, 'day');
    }

    lessons.push({
      sessionId: session.id,
      studentName: user?.name || '알수없음',
      studentPhone: user?.phone || '',
      startTime: session.start_time?.slice(0, 5) || '',
      extensionCount: session.extension_count || 0,
      completedLessons: Math.min(completedLessons, 4),
      isFirstLesson: session.start_date === today,
    });
  }

  lessons.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return NextResponse.json({ success: true, data: lessons });
}

// 수강생 목록 조회
async function handleStudents(supabase: any, coachId: string) {
  // 현재 활성 수강생 + 최근 60일 이내 종료된 수강생 모두 조회
  const sixtyDaysAgo = dayjs().tz('Asia/Seoul').subtract(60, 'day').format('YYYY-MM-DD');

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select(`
      id,
      user_id,
      day_of_week,
      start_time,
      start_date,
      end_date,
      status,
      extension_count,
      user:users(name, phone),
      postponements(postponed_date, reason),
      user_activity_logs(created_at, action_type, reason, metadata)
    `)
    .eq('coach_id', coachId)
    .gte('end_date', sixtyDaysAgo)
    .order('end_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dayIndexMap: Record<string, number> = {
    '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6
  };

  const students = (sessions || []).map((session: any) => {
    const user = Array.isArray(session.user) ? session.user[0] : session.user;

    // completedLessons 계산 (dayjs 통일)
    let completedLessons = 0;
    const sessionDayIndex = dayIndexMap[session.day_of_week] ?? 0;
    const postponedDates = (session.postponements || []).map((p: any) => p.postponed_date);
    const start = dayjs(session.start_date).tz('Asia/Seoul').startOf('day');
    const today = dayjs().tz('Asia/Seoul').startOf('day');
    let check = start;
    while (check.isBefore(today) || check.isSame(today, 'day')) {
      if (check.day() === sessionDayIndex) {
        const dateStr = check.format('YYYY-MM-DD');
        if (!postponedDates.includes(dateStr)) {
          completedLessons++;
        }
      }
      check = check.add(1, 'day');
    }

    return {
      sessionId: session.id,
      userId: session.user_id,
      name: user?.name || '알수없음',
      phone: user?.phone || '',
      dayOfWeek: session.day_of_week,
      startTime: session.start_time?.slice(0, 5) || '',
      startDate: session.start_date,
      endDate: session.end_date,
      status: session.status,
      extensionCount: session.extension_count || 0,
      completedLessons: Math.min(completedLessons, 4),
      postponements: session.postponements || [],
      activityLogs: session.user_activity_logs || [],
    };
  });

  return NextResponse.json({ success: true, data: students });
}

// 슬롯 현황 조회
async function handleSlots(supabase: any, coachId: string) {
  const { data: coachSlots, error: slotsError } = await supabase
    .from('coach_slots')
    .select('id, day_of_week, start_time, is_active')
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');

  if (slotsError) {
    return NextResponse.json({ error: slotsError.message }, { status: 500 });
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select(`
      slot_id,
      day_of_week,
      start_time,
      end_date,
      user:users(name)
    `)
    .eq('coach_id', coachId)
    .in('status', ['ACTIVE', 'PENDING']);

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  const slots = (coachSlots || []).map((slot: any) => {
    const matchedSession = (sessions || []).find((s: any) =>
      s.slot_id === slot.id ||
      (s.day_of_week === slot.day_of_week && s.start_time === slot.start_time)
    );

    const userName = matchedSession?.user
      ? (Array.isArray(matchedSession.user) ? matchedSession.user[0]?.name : matchedSession.user?.name)
      : undefined;

    return {
      id: slot.id,
      dayOfWeek: slot.day_of_week,
      startTime: slot.start_time?.slice(0, 5) || '',
      isAvailable: !matchedSession,
      studentName: userName,
      endDate: matchedSession?.end_date,
    };
  });

  return NextResponse.json({ success: true, data: slots });
}

// 수강생 상세 - 전체 히스토리 조회
async function handleStudentDetail(supabase: any, userId: string) {
  const { data: logs, error } = await supabase
    .from('user_activity_logs')
    .select('created_at, action_type, reason, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: logs || [] });
}
