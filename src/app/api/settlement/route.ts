// app/api/settlement/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getSessionDatesInMonth } from '@/lib/utils/date-calculator';
import { SESSION_STATUS, COACH_SETTLEMENT, COACH_GRADE, DayOfWeek, CoachGrade } from '@/lib/constants';
import dayjs from '@/lib/dayjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 정산 조회
export async function GET(req: Request) {
  const supabase = getServerClient();
  const { searchParams } = new URL(req.url);
  
  // 새로운 파라미터 형식 지원 (YYYY-MM)
  const monthQuery = searchParams.get('month');
  
  let yearParam = searchParams.get('year');
  let monthParam = searchParams.get('month');
  
  // YYYY-MM 형식 파싱
  if (monthQuery && monthQuery.includes('-')) {
    const [y, m] = monthQuery.split('-');
    yearParam = y;
    monthParam = m;
  }
  
  const now = new Date();
  const year = yearParam ? parseInt(yearParam) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam) : now.getMonth() + 1;
  
  try {
    // 1. 해당 월에 활동한 세션들 조회
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select(`
        *,
        user:users(id, name),
        coach:coaches(id, name, grade),
        slot:coach_slots(id, day_of_week, start_time),
        postponements(postponed_date)
      `)
      .or(`start_date.lte.${monthEnd},end_date.gte.${monthStart}`)
      .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.EXPIRED, SESSION_STATUS.REFUNDED, SESSION_STATUS.EARLY_TERMINATED, SESSION_STATUS.CANCELLED]);

    if (sessionsError) {
      console.error('세션 조회 오류:', sessionsError);
      return NextResponse.json({ error: sessionsError.message }, { status: 500 });
    }

    // 2. 정산 확정 여부 확인
    const { data: lock } = await supabase
      .from('settlement_locks')
      .select('*')
      .eq('year', year)
      .eq('month', month)
      .is('unlocked_at', null)
      .single();

    const isLocked = !!lock;

    // 3. 코치별 정산 계산
    const coachSettlements: Record<string, {
      coach: { id: string; name: string; grade: CoachGrade };
      sessions: Array<{
        date: string;
        slotInfo: string;
        studentName: string;
        status: 'normal' | 'postponed' | 'refunded' | 'early_terminated';
      }>;
      totalSessions: number;
      revenue: number;
      coachPayment: number;
      companyProfit: number;
    }> = {};

    for (const session of sessions || []) {
      if (!session.coach) continue;

      const coachId = session.coach.id;
      const coachGrade = session.coach.grade as CoachGrade;
      const settlement = COACH_SETTLEMENT[coachGrade];

      if (!coachSettlements[coachId]) {
        coachSettlements[coachId] = {
          coach: session.coach,
          sessions: [],
          totalSessions: 0,
          revenue: 0,
          coachPayment: 0,
          companyProfit: 0,
        };
      }

      // 연기 날짜 목록
      const postponedDates = session.postponements?.map((p: { postponed_date: string }) => p.postponed_date) || [];

      // 해당 월의 수업 날짜들 계산
      const sessionDates = getSessionDatesInMonth(
        session.start_date,
        session.end_date,
        session.day_of_week as DayOfWeek,
        year,
        month,
        postponedDates,
        session.early_terminated_at
      );

      for (const dateInfo of sessionDates) {
        let status: 'normal' | 'postponed' | 'refunded' | 'early_terminated' = 'normal';
        
        if (dateInfo.isPostponed) {
          status = 'postponed';
        } else if (session.status === SESSION_STATUS.REFUNDED) {
          if (session.early_terminated_at && dateInfo.date > session.early_terminated_at) {
            continue; // 환불일 이후 제외
          }
          status = 'refunded';
        } else if (session.status === SESSION_STATUS.EARLY_TERMINATED) {
          if (session.early_terminated_at && dateInfo.date > session.early_terminated_at) {
            continue; // 조기종료일 이후 제외
          }
          status = 'early_terminated';
        }

        coachSettlements[coachId].sessions.push({
          date: dateInfo.date,
          slotInfo: `${session.day_of_week} ${session.start_time?.slice(0, 5)}`,
          studentName: session.user?.name || '알수없음',
          status,
        });

        // 연기/환불 이후는 정산에서 제외
        if (!dateInfo.isExcluded) {
          coachSettlements[coachId].totalSessions += 1;
          coachSettlements[coachId].revenue += settlement.revenuePerSession;
          coachSettlements[coachId].coachPayment += settlement.perSession;
          coachSettlements[coachId].companyProfit += settlement.companyPerSession;
        }
      }
    }

    // 4. 전체 요약 계산
    const summary = {
      year,
      month,
      totalSessions: 0,
      totalRevenue: 0,
      totalCoachPayment: 0,
      totalCompanyProfit: 0,
      isLocked,
    };

    for (const coachData of Object.values(coachSettlements)) {
      summary.totalSessions += coachData.totalSessions;
      summary.totalRevenue += coachData.revenue;
      summary.totalCoachPayment += coachData.coachPayment;
      summary.totalCompanyProfit += coachData.companyProfit;
    }

    return NextResponse.json({ 
      success: true, 
      // 기존 응답 형식
      data: {
        coaches: Object.values(coachSettlements).sort((a, b) => a.coach.name.localeCompare(b.coach.name)),
        summary,
      },
      // 새 클라이언트용 응답 형식
      targetMonth: `${year}-${String(month).padStart(2, '0')}`,
      isLocked,
      lockData: lock,
      coachSettlements: Object.values(coachSettlements).map(cs => ({
        coach: cs.coach,
        sessions: cs.sessions,
        sessionCount: Math.ceil(cs.totalSessions / 4),
        coachingCount: cs.totalSessions,
        feePerSession: COACH_SETTLEMENT[cs.coach.grade as keyof typeof COACH_SETTLEMENT]?.perSession || 50000,
        totalFee: cs.coachPayment,
      })),
      summary: {
        totalCoachingCount: summary.totalSessions,
        totalRevenue: summary.totalRevenue,
        totalCoachFee: summary.totalCoachPayment,
        companyProfit: summary.totalCompanyProfit,
      },
    });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
