// app/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getServerClient } from '@/lib/supabase/server';
import { DashboardClient } from '@/components/dashboard/dashboard-client';
import { SESSION_STATUS, INBOX_STATUS, LOG_PROCESS_STATUS } from '@/lib/constants';
import dayjs from '@/lib/dayjs';
import { DAYS_ARRAY } from '@/lib/constants';

async function getDashboardData() {
  const supabase = getServerClient();
  const today = dayjs();
  const todayStr = today.format('YYYY-MM-DD');
  const todayDayIndex = today.day();
  const todayDayOfWeek = DAYS_ARRAY[todayDayIndex === 0 ? 6 : todayDayIndex - 1];
  const sixDaysLater = today.add(6, 'day').format('YYYY-MM-DD');
  const thirteenDaysLater = today.add(13, 'day').format('YYYY-MM-DD');

  // 빈 슬롯 수
  const { data: slots } = await supabase
    .from('coach_slots')
    .select(`
      id,
      sessions:sessions(id, status)
    `)
    .eq('is_active', true);

  const emptySlots = slots?.filter(slot => {
    const activeSessions = slot.sessions?.filter(
      (s: { status: string }) => s.status === SESSION_STATUS.ACTIVE || s.status === SESSION_STATUS.PENDING
    );
    return !activeSessions || activeSessions.length === 0;
  }).length || 0;

  // 인박스 미처리 수
  const { count: inboxCount } = await supabase
    .from('ingestion_inbox')
    .select('*', { count: 'exact', head: true })
    .eq('manual_resolution_status', INBOX_STATUS.PENDING);

  // 수강중 수강생 수
  const { count: activeStudents } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('status', SESSION_STATUS.ACTIVE);

  // D-7 이내 종료 예정 (마지막 수업일 기준 = end_date - 6일이 오늘~7일 이내)
  const { count: endingSoon } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('status', SESSION_STATUS.ACTIVE)
    .lte('end_date', thirteenDaysLater)
    .gte('end_date', sixDaysLater);

  // 시스템 오류 (미처리)
  const { count: systemErrors } = await supabase
    .from('system_logs')
    .select('*', { count: 'exact', head: true })
    .eq('process_status', LOG_PROCESS_STATUS.PENDING)
    .eq('status', 'FAILED');

  // SMS 현황 (오늘)
  const todayStart = today.startOf('day').toISOString();
  const todayEnd = today.endOf('day').toISOString();

  const { count: smsTodaySent } = await supabase
    .from('system_logs')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'SMS_SENT')
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd);

  const { count: smsTodayFailed } = await supabase
    .from('system_logs')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'SMS_FAILED')
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd);

  const { count: smsTodayWarning } = await supabase
    .from('system_logs')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'SMS_WARNING')
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd);

  // 오늘의 수업
  const { data: todaySessions } = await supabase
    .from('sessions')
    .select(`
      *,
      user:users(id, name, phone),
      coach:coaches(id, name),
      slot:coach_slots(id, start_time, end_time),
      postponements(postponed_date)
    `)
    .eq('day_of_week', todayDayOfWeek)
    .eq('status', SESSION_STATUS.ACTIVE)
    .lte('start_date', todayStr)
    .gte('end_date', todayStr);

  // 연기된 날짜 필터링
  const todayLessons = todaySessions?.filter(session => {
    const postponedDates = session.postponements?.map((p: { postponed_date: string }) => p.postponed_date) || [];
    return !postponedDates.includes(todayStr);
  }).map(session => ({
    time: session.slot?.start_time?.slice(0, 5) || session.start_time?.slice(0, 5),
    coachName: session.coach?.name || '알수없음',
    studentName: session.user?.name || '알수없음',
    studentPhone: session.user?.phone || '',
    slotId: session.slot_id,
    sessionId: session.id,
  })).sort((a, b) => a.time.localeCompare(b.time)) || [];

  // 인박스 목록
  const { data: inboxItems } = await supabase
    .from('ingestion_inbox')
    .select(`
      *,
      raw_webhook:raw_webhooks(*)
    `)
    .eq('manual_resolution_status', INBOX_STATUS.PENDING)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    kpi: {
      emptySlots,
      inboxCount: inboxCount || 0,
      activeStudents: activeStudents || 0,
      endingSoon: endingSoon || 0,
      systemErrors: systemErrors || 0,
      smsTodaySent: smsTodaySent || 0,
      smsTodayFailed: smsTodayFailed || 0,
      smsTodayWarning: smsTodayWarning || 0,
    },
    todayLessons,
    inboxItems: inboxItems || [],
    date: todayStr,
    dayOfWeek: todayDayOfWeek,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return <DashboardClient initialData={data} />;
}
