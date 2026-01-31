// app/api/coaches/[id]/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone-normalizer';

export const dynamic = 'force-dynamic';

// 코치 정보 수정
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const coachId = params.id;

  try {
    const body = await req.json();
    const { name, phone, grade, bankAccount } = body;

    // 기존 정보 조회
    const { data: existingCoach, error: fetchError } = await supabase
      .from('coaches')
      .select('*')
      .eq('id', coachId)
      .single();

    if (fetchError || !existingCoach) {
      return NextResponse.json({ success: false, error: '코치를 찾을 수 없습니다.' }, { status: 404 });
    }

    const updateData: Record<string, string | null> = {};
    
    if (name && name !== existingCoach.name) updateData.name = name;
    if (phone) {
      const normalizedPhone = normalizePhone(phone);
      if (normalizedPhone !== existingCoach.phone) updateData.phone = normalizedPhone;
    }
    if (grade && grade !== existingCoach.grade) updateData.grade = grade;
    if (bankAccount !== undefined && bankAccount !== existingCoach.bank_account) {
      updateData.bank_account = bankAccount || null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, message: '변경 사항이 없습니다.' });
    }

    const { error } = await supabase
      .from('coaches')
      .update(updateData)
      .eq('id', coachId);

    if (error) {
      console.error('코치 수정 실패:', error);
      return NextResponse.json({ success: false, error: '코치 수정에 실패했습니다.' }, { status: 500 });
    }

    // 변경 이력 기록
    for (const [field, newValue] of Object.entries(updateData)) {
      const oldValue = existingCoach[field as keyof typeof existingCoach];
      await supabase.from('change_logs').insert({
        table_name: 'coaches',
        record_id: coachId,
        field_name: field,
        old_value: oldValue ? String(oldValue) : null,
        new_value: newValue ? String(newValue) : null,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('코치 수정 오류:', error);
    return NextResponse.json({ success: false, error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
