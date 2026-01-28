// app/api/logs/[id]/status/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const logId = params.id;

  try {
    const body = await req.json();
    const { status } = body;

    if (!status || !['RESOLVED', 'IGNORED', 'PENDING', 'SUCCESS'].includes(status)) {
      return NextResponse.json({ error: '올바른 상태가 아닙니다.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('system_logs')
      .update({ process_status: status })
      .eq('id', logId);

    if (error) {
      console.error('로그 상태 변경 실패:', error);
      return NextResponse.json({ error: '상태 변경에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('상태 변경 오류:', error);
    return NextResponse.json({ error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
