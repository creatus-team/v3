// app/api/logs/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import dayjs from '@/lib/dayjs';
import { LOG_PROCESS_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 시스템 로그 목록 조회
export async function GET(req: Request) {
  const supabase = getServerClient();
  const { searchParams } = new URL(req.url);
  
  const dateFilter = searchParams.get('dateFilter') || 'today';
  const statusFilter = searchParams.get('statusFilter') || 'all';
  const errorsOnly = searchParams.get('errorsOnly') === 'true';
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  
  try {
    let query = supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    // 날짜 필터
    let dateStart: string;
    let dateEnd: string;
    const today = dayjs();

    switch (dateFilter) {
      case 'today':
        dateStart = today.startOf('day').toISOString();
        dateEnd = today.endOf('day').toISOString();
        break;
      case 'yesterday':
        dateStart = today.subtract(1, 'day').startOf('day').toISOString();
        dateEnd = today.subtract(1, 'day').endOf('day').toISOString();
        break;
      case 'week':
        dateStart = today.subtract(7, 'day').startOf('day').toISOString();
        dateEnd = today.endOf('day').toISOString();
        break;
      case 'custom':
        if (startDate && endDate) {
          dateStart = dayjs(startDate).startOf('day').toISOString();
          dateEnd = dayjs(endDate).endOf('day').toISOString();
        } else {
          dateStart = today.startOf('day').toISOString();
          dateEnd = today.endOf('day').toISOString();
        }
        break;
      default:
        dateStart = today.startOf('day').toISOString();
        dateEnd = today.endOf('day').toISOString();
    }

    query = query.gte('created_at', dateStart).lte('created_at', dateEnd);

    // 상태 필터
    if (statusFilter === 'pending') {
      query = query.eq('process_status', LOG_PROCESS_STATUS.PENDING);
    } else if (statusFilter === 'resolved') {
      query = query.in('process_status', [LOG_PROCESS_STATUS.RESOLVED, LOG_PROCESS_STATUS.IGNORED]);
    }

    // 오류만
    if (errorsOnly) {
      query = query.eq('status', 'FAILED');
    }

    const { data, error } = await query;

    if (error) {
      console.error('로그 조회 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 로그 상태 변경
export async function PATCH(req: Request) {
  const supabase = getServerClient();
  
  try {
    const body = await req.json();
    const { id, processStatus } = body;

    if (!id || !processStatus) {
      return NextResponse.json({ error: '필수 필드가 누락되었습니다' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      process_status: processStatus,
    };

    if (processStatus === LOG_PROCESS_STATUS.RESOLVED || processStatus === LOG_PROCESS_STATUS.IGNORED) {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('system_logs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('로그 상태 변경 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
