// app/students/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getServerClient } from '@/lib/supabase/server';
import { StudentsClient } from '@/components/students/students-client';
import { SESSION_STATUS } from '@/lib/constants';
import dayjs from '@/lib/dayjs';

async function getStudentsData() {
  const supabase = getServerClient();

  const { data: users, error } = await supabase
    .from('users')
    .select(`
      *,
      sessions:sessions(
        *,
        coach:coaches(id, name, grade),
        slot:coach_slots(id, day_of_week, start_time, open_chat_link),
        postponements(*)
      ),
      activity_logs:user_activity_logs(*)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('수강생 조회 오류:', error);
    return { students: [] };
  }

  // 수강생 상태 계산
  const studentsWithStatus = users?.map(user => {
    const sessions = user.sessions || [];
    const sortedSessions = [...sessions].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    const activeSession = sessions.find((s: { status: string }) => s.status === SESSION_STATUS.ACTIVE);
    const pendingSession = sessions.find((s: { status: string }) => s.status === SESSION_STATUS.PENDING);
    const currentSession = activeSession || pendingSession || sortedSessions[0];

    let displayStatus: string;
    let dDay: number | null = null;

    if (activeSession) {
      displayStatus = 'active';
      const lastLessonDate = dayjs(activeSession.end_date).subtract(6, 'day');
      const today = dayjs().tz('Asia/Seoul').startOf('day');
      dDay = lastLessonDate.diff(today, 'day');
    } else if (pendingSession) {
      displayStatus = 'pending';
    } else if (currentSession) {
      displayStatus = currentSession.status === SESSION_STATUS.REFUNDED
        ? 'refunded'
        : currentSession.status === SESSION_STATUS.CANCELLED
        ? 'cancelled'
        : currentSession.status === SESSION_STATUS.EARLY_TERMINATED
        ? 'early_terminated'
        : 'expired';
    } else {
      displayStatus = 'expired';
    }

    // completedLessons 계산 (4주 중 몇 회 수업했는지)
    let completedLessons = 0;
    if (currentSession) {
      const startDate = new Date(currentSession.start_date);
      const today = new Date(dayjs().tz('Asia/Seoul').format('YYYY-MM-DD'));
      const dayIndexMap: Record<string, number> = {
        '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6
      };
      const sessionDayIndex = dayIndexMap[currentSession.day_of_week] ?? 0;
      const postponedDates = currentSession.postponements?.map(
        (p: { postponed_date: string }) => p.postponed_date
      ) || [];

      // 종료된 세션은 실제 종료 시점까지만 카운팅
      let endBound = today;
      if (currentSession.status !== 'ACTIVE' && currentSession.status !== 'PENDING') {
        const terminatingActions = ['CANCEL', 'REFUND', 'EARLY_TERMINATE'];
        const logs = user.activity_logs || [];
        const terminationLog = logs
          .filter((log: any) => terminatingActions.includes(log.action_type))
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        if (terminationLog) {
          endBound = new Date(dayjs(terminationLog.created_at).tz('Asia/Seoul').format('YYYY-MM-DD'));
        } else {
          endBound = new Date(dayjs(currentSession.end_date).subtract(6, 'day').format('YYYY-MM-DD'));
        }
        if (endBound > today) endBound = today;
      }

      let checkDate = new Date(startDate);
      while (checkDate <= endBound) {
        if (checkDate.getDay() === sessionDayIndex) {
          const dateStr = checkDate.toISOString().split('T')[0];
          if (!postponedDates.includes(dateStr)) {
            completedLessons++;
          }
        }
        checkDate.setDate(checkDate.getDate() + 1);
      }
    }

    return {
      ...user,
      displayStatus,
      currentSession,
      sessions: sortedSessions,
      dDay,
      extensionCount: (currentSession?.extension_count || 0) + 1,
      completedLessons: Math.min(completedLessons, 4),
    };
  }) || [];

  return { students: studentsWithStatus };
}

export default async function StudentsPage() {
  const data = await getStudentsData();
  return <StudentsClient initialStudents={data.students} />;
}
