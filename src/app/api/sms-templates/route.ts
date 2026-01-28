// app/api/sms-templates/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 모든 템플릿 조회
export async function GET() {
  const supabase = getServerClient();

  const { data, error } = await supabase
    .from('sms_templates')
    .select('*')
    .order('event_type')
    .order('recipient_type');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
