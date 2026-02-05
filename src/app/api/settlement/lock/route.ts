// app/api/settlement/lock/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 정산 확정
export async function POST(req: Request) {
  const supabase = getServerClient();
  
  try {
    const body = await req.json();
    const { year, month } = body;

    if (!year || !month) {
      return NextResponse.json({ error: '년/월이 필요합니다' }, { status: 400 });
    }

    // 이미 확정되었는지 확인
    const { data: existing } = await supabase
      .from('settlement_locks')
      .select('*')
      .eq('year', year)
      .eq('month', month)
      .is('unlocked_at', null)
      .single();

    if (existing) {
      return NextResponse.json({ error: '이미 확정된 월입니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('settlement_locks')
      .insert({
        year,
        month,
      })
      .select()
      .single();

    if (error) {
      console.error('정산 확정 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
