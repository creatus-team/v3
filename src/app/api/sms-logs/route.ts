// app/api/sms-logs/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(req: Request) {
  const supabase = getServerClient();
  const { searchParams } = new URL(req.url);
  
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const status = searchParams.get('status'); // SENT, FAILED, DELIVERED
  const recipientType = searchParams.get('recipientType'); // STUDENT, COACH, ADMIN
  const search = searchParams.get('search'); // 전화번호 검색
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('sms_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // 필터링
    if (status) {
      query = query.eq('status', status);
    }
    if (recipientType) {
      query = query.eq('recipient_type', recipientType);
    }
    if (search) {
      query = query.ilike('recipient_phone', `%${search}%`);
    }
    if (startDate) {
      query = query.gte('created_at', `${startDate}T00:00:00`);
    }
    if (endDate) {
      query = query.lte('created_at', `${endDate}T23:59:59`);
    }

    // 페이지네이션
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('SMS 로그 조회 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      logs: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      _timestamp: Date.now(), // 캐시 방지용
    }, {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('SMS 로그 조회 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
