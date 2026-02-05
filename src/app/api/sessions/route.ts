// app/api/sessions/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getToday } from '@/lib/utils/date-calculator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 세션 목록 조회
export async function GET(req: Request) {
  const supabase = getServerClient();
  const { searchParams } = new URL(req.url);
  
  const status = searchParams.get('status');
  const coachId = searchParams.get('coachId');
  const userId = searchParams.get('userId');
  
  try {
    let query = supabase
      .from('sessions')
      .select(`
        *,
        user:users(*),
        coach:coaches(*),
        slot:coach_slots(*),
        postponements(*)
      `)
      .order('end_date', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    if (coachId) {
      query = query.eq('coach_id', coachId);
    }

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('세션 조회 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
