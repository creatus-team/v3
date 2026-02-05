// app/sms-logs/page.tsx
export const dynamic = 'force-dynamic';

import { SmsLogsClient } from '@/components/sms-logs/sms-logs-client';

export default function SmsLogsPage() {
  return <SmsLogsClient />;
}
