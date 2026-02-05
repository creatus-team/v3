// app/api/sms-templates/[id]/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 템플릿 수정
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const templateId = params.id;

  try {
    const body = await req.json();
    const { content, is_active, schedule_days_before, schedule_time } = body;

    const updateData: Record<string, unknown> = {};
    
    if (content !== undefined) updateData.content = content;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (schedule_days_before !== undefined) updateData.schedule_days_before = schedule_days_before;
    if (schedule_time !== undefined) updateData.schedule_time = schedule_time;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, message: '변경 사항 없음' });
    }

    const { data, error } = await supabase
      .from('sms_templates')
      .update(updateData)
      .eq('id', templateId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('템플릿 수정 오류:', error);
    return NextResponse.json({ error: '오류 발생' }, { status: 500 });
  }
}
