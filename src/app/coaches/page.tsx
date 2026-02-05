// app/coaches/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getServerClient } from '@/lib/supabase/server';
import { CoachesClient } from '@/components/coaches/coaches-client';
import { SESSION_STATUS } from '@/lib/constants';

async function getCoachesData() {
  const supabase = getServerClient();

  // 코치 목록 + 슬롯 + 세션 정보
  const { data: coaches, error } = await supabase
    .from('coaches')
    .select(`
      *,
      slots:coach_slots(
        *,
        sessions:sessions(
          *,
          user:users(id, name, phone),
          postponements(postponed_date)
        )
      )
    `)
    .order('name');

  if (error) {
    console.error('코치 조회 오류:', error);
    return { coaches: [] };
  }

  // 슬롯 수 및 활성 세션 계산
  const coachesWithInfo = coaches?.map(coach => {
    const slots = coach.slots || [];
    const activeSlots = slots.filter((s: { is_active: boolean }) => s.is_active);
    
    // 각 슬롯에 현재 세션 정보 추가
    const slotsWithSession = activeSlots.map((slot: { sessions?: Array<{ status: string }> }) => {
      const sessions = slot.sessions || [];
      const currentSession = sessions.find(
        (s: { status: string }) => s.status === SESSION_STATUS.ACTIVE || s.status === SESSION_STATUS.PENDING
      );
      return {
        ...slot,
        currentSession,
      };
    });

    return {
      ...coach,
      slots: slotsWithSession,
      activeSlotCount: activeSlots.length,
      occupiedSlotCount: slotsWithSession.filter((s: { currentSession?: unknown }) => s.currentSession).length,
    };
  }).sort((a, b) => {
    // 슬롯 0개인 코치는 아래로
    if (a.activeSlotCount === 0 && b.activeSlotCount > 0) return 1;
    if (a.activeSlotCount > 0 && b.activeSlotCount === 0) return -1;
    return a.name.localeCompare(b.name);
  }) || [];

  return { coaches: coachesWithInfo };
}

export default async function CoachesPage() {
  const data = await getCoachesData();
  return <CoachesClient initialCoaches={data.coaches} />;
}
