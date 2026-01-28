// app/api/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { normalizePhone, isValidPhone } from '@/lib/utils/phone-normalizer';
import { ACTION_TYPE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// 수강생 정보 조회
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const userId = params.id;

  const { data: user, error } = await supabase
    .from('users')
    .select(`
      *,
      sessions:sessions(
        *,
        coach:coaches(id, name, grade),
        slot:coach_slots(id, day_of_week, start_time),
        postponements(*)
      ),
      activity_logs:user_activity_logs(*)
    `)
    .eq('id', userId)
    .single();

  if (error) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ user });
}

// 수강생 정보 수정
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getServerClient();
  const userId = params.id;

  try {
    const body = await req.json();
    const { name, phone, email, memo } = body;

    // 기존 정보 조회
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !existingUser) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 전화번호 변경 시 유효성 검사
    let normalizedPhone = existingUser.phone;
    if (phone && phone !== existingUser.phone) {
      normalizedPhone = normalizePhone(phone);
      if (!isValidPhone(normalizedPhone)) {
        return NextResponse.json({ error: '올바른 전화번호 형식이 아닙니다.' }, { status: 400 });
      }

      // 중복 체크
      const { data: duplicate } = await supabase
        .from('users')
        .select('id')
        .eq('phone', normalizedPhone)
        .neq('id', userId)
        .single();

      if (duplicate) {
        return NextResponse.json({ error: '이미 등록된 전화번호입니다.' }, { status: 400 });
      }
    }

    // 업데이트 데이터 구성
    const updateData: Record<string, string | null> = {};
    if (name && name !== existingUser.name) updateData.name = name;
    if (normalizedPhone !== existingUser.phone) updateData.phone = normalizedPhone;
    if (email !== undefined && email !== existingUser.email) updateData.email = email || null;
    if (memo !== undefined && memo !== existingUser.memo) updateData.memo = memo || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, message: '변경 사항이 없습니다.' });
    }

    // 업데이트 실행
    const { error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (updateError) {
      console.error('수강생 정보 수정 실패:', updateError);
      return NextResponse.json({ error: '정보 수정에 실패했습니다.' }, { status: 500 });
    }

    // 변경 이력 기록
    for (const [field, newValue] of Object.entries(updateData)) {
      const oldValue = existingUser[field as keyof typeof existingUser];
      await supabase.from('change_logs').insert({
        table_name: 'users',
        record_id: userId,
        field_name: field,
        old_value: oldValue ? String(oldValue) : null,
        new_value: newValue ? String(newValue) : null,
      });
    }

    // 활동 로그 기록
    await supabase.from('user_activity_logs').insert({
      user_id: userId,
      action_type: ACTION_TYPE.EDIT,
      reason: '정보 수정',
      metadata: { changes: updateData },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('정보 수정 오류:', error);
    return NextResponse.json({ error: '정보 수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
