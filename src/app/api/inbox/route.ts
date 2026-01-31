// app/api/inbox/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { INBOX_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 인박스 목록 조회
export async function GET(req: Request) {
  const supabase = getServerClient();
  const { searchParams } = new URL(req.url);
  
  const status = searchParams.get('status');
  
  try {
    let query = supabase
      .from('ingestion_inbox')
      .select(`
        *,
        raw_webhook:raw_webhooks(*)
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('manual_resolution_status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('인박스 조회 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 인박스 상태 변경
export async function PATCH(req: Request) {
  const supabase = getServerClient();
  
  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: '필수 필드가 누락되었습니다' }, { status: 400 });
    }

    if (!Object.values(INBOX_STATUS).includes(status)) {
      return NextResponse.json({ error: '유효하지 않은 상태입니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ingestion_inbox')
      .update({ manual_resolution_status: status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('인박스 상태 변경 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
