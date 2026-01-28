// app/settlement/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getServerClient } from '@/lib/supabase/server';
import { SettlementClient } from '@/components/settlement/settlement-client';
import dayjs from '@/lib/dayjs';
import { COACH_GRADE, COACH_SETTLEMENT, SESSION_STATUS } from '@/lib/constants';

async function getSettlementData(yearMonth?: string) {
  const supabase = getServerClient();
  
  // 기본: 현재 월
  const targetMonth = yearMonth || dayjs().format('YYYY-MM');
  const startDate = `${targetMonth}-01`;
  const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');

  // 1. 정산 확정 상태 조회
  const { data: lockData } = await supabase
    .from('settlement_locks')
    .select('*')
    .eq('year_month', targetMonth)
    .single();

  const isLocked = !!lockData?.locked_at;

  // 2. 해당 월의 세션 조회 (완료된 것만)
  const { data: sessions, error: sessionError } = await supabase
    .from('sessions')
    .select(`
      *,
      coach:coaches(id, name, grade),
      user:users(id, name, phone)
    `)
    .gte('start_date', startDate)
    .lte('start_date', endDate)
    .in('status', [SESSION_STATUS.ACTIVE, SESSION_STATUS.EXPIRED]);

  if (sessionError) {
    console.error('세션 조회 오류:', sessionError);
  }

  // 3. 코치 목록 조회
  const { data: coaches } = await supabase
    .from('coaches')
    .select('*')
    .eq('is_active', true);

  // 4. 코치별 정산 계산
  const coachSettlements = (coaches || []).map(coach => {
    const coachSessions = (sessions || []).filter(s => s.coach_id === coach.id);
    
    // 실제 코칭 횟수 = 세션당 4회 가정 (또는 연기 제외 계산)
    // 여기서는 세션 수 × 4로 계산
    const sessionCount = coachSessions.length;
    const coachingCount = sessionCount * 4;
    
    // 단가 계산
    const feePerSession = COACH_SETTLEMENT[coach.grade as keyof typeof COACH_SETTLEMENT]?.perSession || 50000;
    
    const totalFee = coachingCount * feePerSession;

    return {
      coach,
      sessions: coachSessions,
      sessionCount,
      coachingCount,
      feePerSession,
      totalFee,
    };
  }).filter(c => c.sessionCount > 0);

  // 5. 월 요약
  const totalCoachingCount = coachSettlements.reduce((sum, c) => sum + c.coachingCount, 0);
  const totalCoachFee = coachSettlements.reduce((sum, c) => sum + c.totalFee, 0);
  const totalRevenue = (sessions || []).reduce((sum, s) => sum + (s.payment_amount || 0), 0);
  const companyProfit = totalRevenue - totalCoachFee;

  return {
    targetMonth,
    isLocked,
    lockData,
    coachSettlements,
    summary: {
      totalCoachingCount,
      totalRevenue,
      totalCoachFee,
      companyProfit,
    },
  };
}

export default async function SettlementPage() {
  const data = await getSettlementData();
  return <SettlementClient initialData={data} />;
}
