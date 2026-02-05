// app/settings/page.tsx
import { getServerClient } from '@/lib/supabase/server';
import { SettingsClient } from '@/components/settings/settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = getServerClient();

  const { data: templates } = await supabase
    .from('sms_templates')
    .select('*')
    .order('event_type')
    .order('recipient_type');

  return <SettingsClient templates={templates || []} />;
}
