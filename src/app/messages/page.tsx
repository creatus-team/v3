// app/messages/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getServerClient } from '@/lib/supabase/server';
import { MessagesClient } from '@/components/messages/messages-client';

async function getLogsData() {
  const supabase = getServerClient();

  // 최근 7일 로그 조회
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: logs, error } = await supabase
    .from('system_logs')
    .select('*')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('로그 조회 오류:', error);
    return { logs: [] };
  }

  return { logs: logs || [] };
}

export default async function MessagesPage() {
  const data = await getLogsData();
  return <MessagesClient initialLogs={data.logs} />;
}
