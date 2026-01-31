// app/api/coaches/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone-normalizer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 코치 목록 조회
export async function GET() {
  const supabase = getServerClient();
  
  try {
    const { data: coaches, error } = await supabase
      .from('coaches')
      .select(`
        *,
        slots:coach_slots(
          id,
          day_of_week,
          start_time,
          end_time,
          is_active
        )
      `)
      .order('name');

    if (error) {
      console.error('코치 조회 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 슬롯 수 계산 및 정렬 (슬롯 0개인 코치는 아래로)
    const coachesWithSlotCount = coaches?.map(coach => ({
      ...coach,
      activeSlotCount: coach.slots?.filter((s: { is_active: boolean }) => s.is_active).length || 0,
    })).sort((a, b) => {
      if (a.activeSlotCount === 0 && b.activeSlotCount > 0) return 1;
      if (a.activeSlotCount > 0 && b.activeSlotCount === 0) return -1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ success: true, data: coachesWithSlotCount });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 코치 추가
export async function POST(req: Request) {
  const supabase = getServerClient();
  
  try {
    const body = await req.json();
    const { name, phone, grade, bankAccount, maxSlots } = body;

    if (!name) {
      return NextResponse.json({ error: '이름은 필수입니다' }, { status: 400 });
    }

    const normalizedPhone = phone ? normalizePhone(phone) : null;

    // 전화번호 중복 체크 (경고용)
    let duplicateCoach = null;
    if (normalizedPhone) {
      const { data: existing } = await supabase
        .from('coaches')
        .select('id, name')
        .eq('phone', normalizedPhone)
        .single();
      
      duplicateCoach = existing;
    }

    const { data, error } = await supabase
      .from('coaches')
      .insert({
        name,
        phone: normalizedPhone,
        grade: grade || 'REGULAR',
        bank_account: bankAccount || null,
        max_slots: maxSlots || 10,
      })
      .select()
      .single();

    if (error) {
      console.error('코치 추가 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      data,
      warning: duplicateCoach ? `전화번호가 ${duplicateCoach.name} 코치와 동일합니다` : null,
    });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
