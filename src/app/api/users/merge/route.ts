// app/api/users/merge/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { ACTION_TYPE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = getServerClient();

  try {
    const body = await req.json();
    const { keepUserId, mergeUserId } = body;

    if (!keepUserId || !mergeUserId) {
      return NextResponse.json({ error: '유지할 수강생과 병합할 수강생을 선택하세요.' }, { status: 400 });
    }

    if (keepUserId === mergeUserId) {
      return NextResponse.json({ error: '같은 수강생을 병합할 수 없습니다.' }, { status: 400 });
    }

    // 두 수강생 정보 조회
    const { data: keepUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', keepUserId)
      .single();

    const { data: mergeUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', mergeUserId)
      .single();

    if (!keepUser || !mergeUser) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 1. mergeUser의 세션들을 keepUser로 이동
    const { error: sessionError } = await supabase
      .from('sessions')
      .update({ user_id: keepUserId })
      .eq('user_id', mergeUserId);

    if (sessionError) {
      console.error('세션 이동 실패:', sessionError);
      return NextResponse.json({ error: '세션 이동에 실패했습니다.' }, { status: 500 });
    }

    // 2. mergeUser의 활동 로그를 keepUser로 이동
    const { error: logError } = await supabase
      .from('user_activity_logs')
      .update({ user_id: keepUserId })
      .eq('user_id', mergeUserId);

    if (logError) {
      console.error('활동 로그 이동 실패:', logError);
    }

    // 3. 병합 활동 로그 기록
    await supabase.from('user_activity_logs').insert({
      user_id: keepUserId,
      action_type: ACTION_TYPE.USER_MERGE,
      reason: `${mergeUser.phone} → ${keepUser.phone}`,
      metadata: {
        mergedUserId: mergeUserId,
        mergedUserName: mergeUser.name,
        mergedUserPhone: mergeUser.phone,
      },
    });

    // 4. mergeUser 삭제
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', mergeUserId);

    if (deleteError) {
      console.error('수강생 삭제 실패:', deleteError);
      return NextResponse.json({ error: '병합 대상 삭제에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `${mergeUser.name}(${mergeUser.phone})이 ${keepUser.name}(${keepUser.phone})으로 병합되었습니다.`,
    });
  } catch (error) {
    console.error('수강생 병합 오류:', error);
    return NextResponse.json({ error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
