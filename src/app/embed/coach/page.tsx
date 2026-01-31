// src/app/embed/coach/page.tsx
import { getServerClient } from '@/lib/supabase/server';
import { CoachEmbedClient } from '@/components/embed/coach-embed-client';

export const dynamic = 'force-dynamic';

export default async function CoachEmbedPage() {
  const supabase = getServerClient();

  // 코치 목록 조회
  const { data: coaches } = await supabase
    .from('coaches')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  return <CoachEmbedClient coaches={coaches || []} />;
}
