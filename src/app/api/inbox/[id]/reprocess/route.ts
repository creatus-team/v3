// app/api/inbox/[id]/reprocess/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { INBOX_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// 인박스 재처리 (원본 웹훅 다시 처리)
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const inboxId = params.id;

  try {
    // 1. 인박스 항목 조회
    const { data: inboxItem, error: inboxError } = await supabase
      .from('ingestion_inbox')
      .select('*, raw_webhook:raw_webhooks(*)')
      .eq('id', inboxId)
      .single();

    if (inboxError || !inboxItem) {
      return NextResponse.json({ error: '인박스 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 2. 원본 웹훅 데이터 가져오기
    const payload = inboxItem.raw_webhook?.payload;
    if (!payload) {
      return NextResponse.json({ error: '원본 데이터가 없습니다.' }, { status: 400 });
    }

    // 3. 기존 인박스 항목 삭제 (재처리 시 새로 생성될 수 있음)
    await supabase
      .from('ingestion_inbox')
      .update({ manual_resolution_status: INBOX_STATUS.IGNORED })
      .eq('id', inboxId);

    // 4. raw_webhook의 processed를 false로 변경 (재처리 가능하게)
    if (inboxItem.raw_webhook_id) {
      await supabase
        .from('raw_webhooks')
        .update({ processed: false })
        .eq('id', inboxItem.raw_webhook_id);
    }

    // 5. ingest/sheet API 직접 호출 (내부 호출)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/ingest/sheet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RCCC-Token': process.env.WEBHOOK_SECRET_TOKEN || '',
        'X-Reprocess': 'true', // 재처리 표시
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      return NextResponse.json({
        success: true,
        message: '재처리가 완료되었습니다.',
        data: result.data,
      });
    } else if (result.status === 'moved_to_inbox') {
      return NextResponse.json({
        success: false,
        message: `재처리 실패: ${result.reason}`,
        reason: result.reason,
      }, { status: 400 });
    } else {
      return NextResponse.json({
        success: false,
        message: result.error || '재처리에 실패했습니다.',
      }, { status: 400 });
    }
  } catch (error) {
    console.error('재처리 오류:', error);
    return NextResponse.json({ error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
