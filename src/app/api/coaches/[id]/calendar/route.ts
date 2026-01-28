// app/api/coaches/[id]/calendar/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import dayjs from '@/lib/dayjs';
import { SESSION_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const coachId = params.id;
  const { searchParams } = new URL(req.url);
  
  // 월 파라미터 (기본: 이번 달)
  const monthParam = searchParams.get('month'); // YYYY-MM 형식
  const targetMonth = monthParam ? dayjs(monthParam + '-01') : dayjs();
  
  const monthStart = targetMonth.startOf('month').format('YYYY-MM-DD');
  const monthEnd = targetMonth.endOf('month').format('YYYY-MM-DD');

  try {
    // 해당 코치의 활성 세션들 조회
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select(`
        *,
        user:users(id, name, phone),
        slot:coach_slots(id, day_of_week, start_time),
        postponements(postponed_date, reason)
      `)
      .eq('coach_id', coachId)
      .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING, SESSION_STATUS.EXPIRED, SESSION_STATUS.REFUNDED])
      .or(`start_date.lte.${monthEnd},end_date.gte.${monthStart}`);

    if (error) {
      console.error('캘린더 조회 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 해당 월의 모든 수업 날짜 계산
    const calendarDays: Array<{
      date: string;
      dayOfWeek: string;
      lessons: Array<{
        sessionId: string;
        studentName: string;
        startTime: string;
        status: 'normal' | 'postponed' | 'refunded' | 'expired';
        slotId?: string;
      }>;
    }> = [];

    // 요일 인덱스 맵
    const dayIndexMap: Record<string, number> = {
      '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6
    };
    const dayNameMap = ['일', '월', '화', '수', '목', '금', '토'];

    // 월의 모든 날짜를 순회
    let currentDate = targetMonth.startOf('month');
    const endOfMonth = targetMonth.endOf('month');

    while (currentDate.isBefore(endOfMonth) || currentDate.isSame(endOfMonth, 'day')) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const dayOfWeek = dayNameMap[currentDate.day()];
      
      const dayLessons: typeof calendarDays[0]['lessons'] = [];

      // 각 세션에 대해 이 날짜에 수업이 있는지 확인
      for (const session of sessions || []) {
        // 세션의 요일과 현재 날짜의 요일이 같은지
        if (session.day_of_week !== dayOfWeek) continue;
        
        // 세션 기간 내인지
        if (dateStr < session.start_date || dateStr > session.end_date) continue;

        // 연기된 날짜인지
        const postponedDates = session.postponements?.map((p: { postponed_date: string }) => p.postponed_date) || [];
        const isPostponed = postponedDates.includes(dateStr);

        // 환불일 이후인지
        if (session.status === SESSION_STATUS.REFUNDED && session.early_terminated_at && dateStr >= session.early_terminated_at) {
          continue;
        }

        let status: 'normal' | 'postponed' | 'refunded' | 'expired' = 'normal';
        if (isPostponed) {
          status = 'postponed';
        } else if (session.status === SESSION_STATUS.REFUNDED) {
          status = 'refunded';
        } else if (session.status === SESSION_STATUS.EXPIRED) {
          status = 'expired';
        }

        dayLessons.push({
          sessionId: session.id,
          studentName: session.user?.name || '알수없음',
          startTime: session.start_time?.slice(0, 5) || session.slot?.start_time?.slice(0, 5) || '',
          status,
          slotId: session.slot_id,
        });
      }

      if (dayLessons.length > 0) {
        calendarDays.push({
          date: dateStr,
          dayOfWeek,
          lessons: dayLessons.sort((a, b) => a.startTime.localeCompare(b.startTime)),
        });
      }

      currentDate = currentDate.add(1, 'day');
    }

    // 이번 달 코칭 횟수 계산 (연기 제외, 정상 수업만)
    const coachingCount = calendarDays.reduce((sum, day) => {
      return sum + day.lessons.filter(l => l.status === 'normal').length;
    }, 0);

    // 연기 횟수
    const postponedCount = calendarDays.reduce((sum, day) => {
      return sum + day.lessons.filter(l => l.status === 'postponed').length;
    }, 0);

    return NextResponse.json({
      success: true,
      data: {
        month: targetMonth.format('YYYY-MM'),
        days: calendarDays,
        summary: {
          coachingCount,
          postponedCount,
          totalScheduled: coachingCount + postponedCount,
        },
      },
    });
  } catch (error) {
    console.error('캘린더 API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
