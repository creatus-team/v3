// app/api/settlement/unlock/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 정산 확정 취소
export async function POST(req: Request) {
  const supabase = getServerClient();
  
  try {
    const body = await req.json();
    const { year, month } = body;

    if (!year || !month) {
      return NextResponse.json({ error: '년/월이 필요합니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('settlement_locks')
      .update({ unlocked_at: new Date().toISOString() })
      .eq('year', year)
      .eq('month', month)
      .is('unlocked_at', null)
      .select()
      .single();

    if (error) {
      console.error('정산 확정 취소 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: '확정된 정산을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
