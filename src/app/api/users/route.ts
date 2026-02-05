// app/api/users/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { normalizePhone, isValidPhone } from '@/lib/utils/phone-normalizer';
import { calculateStartDate, calculateEndDate } from '@/lib/utils/date-calculator';
import { SESSION_STATUS, ACTION_TYPE, MANUAL_ENTRY_REASON, DayOfWeek } from '@/lib/constants';
import dayjs from '@/lib/dayjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 수강생 목록 조회
export async function GET(req: Request) {
  const supabase = getServerClient();
  const { searchParams } = new URL(req.url);
  
  const search = searchParams.get('search');
  const statusFilter = searchParams.get('status');
  const sortBy = searchParams.get('sortBy') || 'endingSoon';
  
  try {
    let query = supabase
      .from('users')
      .select(`
        *,
        sessions:sessions(
          *,
          coach:coaches(id, name, grade),
          slot:coach_slots(id, day_of_week, start_time, open_chat_link),
          postponements(*)
        ),
        activity_logs:user_activity_logs(*)
      `);

    // 검색어 필터
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('수강생 조회 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 수강생 상태 계산 및 필터/정렬
    const usersWithStatus = data?.map(user => {
      const sessions = user.sessions || [];
      const activeSession = sessions.find((s: { status: string }) => s.status === SESSION_STATUS.ACTIVE);
      const pendingSession = sessions.find((s: { status: string }) => s.status === SESSION_STATUS.PENDING);
      const latestSession = sessions.sort((a: { created_at: string }, b: { created_at: string }) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      let displayStatus: string;
      let currentSession = null;
      let dDay = null;

      if (activeSession) {
        displayStatus = 'active';
        currentSession = activeSession;
        // 마지막 수업일 = end_date - 6일 (end_date는 기간 끝, 마지막 수업일은 같은 요일)
        const lastLessonDate = new Date(activeSession.end_date);
        lastLessonDate.setDate(lastLessonDate.getDate() - 6);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dDay = Math.ceil((lastLessonDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      } else if (pendingSession) {
        displayStatus = 'pending';
        currentSession = pendingSession;
      } else if (latestSession) {
        if (latestSession.status === SESSION_STATUS.REFUNDED) {
          displayStatus = 'refunded';
        } else if (latestSession.status === SESSION_STATUS.CANCELLED) {
          displayStatus = 'cancelled';
        } else if (latestSession.status === SESSION_STATUS.EARLY_TERMINATED) {
          displayStatus = 'early_terminated';
        } else {
          displayStatus = 'expired';
        }
        currentSession = latestSession;
      } else {
        displayStatus = 'expired';
      }

      // 연장 횟수
      const extensionCount = currentSession?.extension_count || 0;

      // 완료된 수업 횟수 계산
      let completedLessons = 0;
      if (currentSession && (currentSession.status === 'ACTIVE' || currentSession.status === 'PENDING')) {
        const startDate = new Date(currentSession.start_date);
        const today = new Date(dayjs().tz('Asia/Seoul').format('YYYY-MM-DD'));
        
        // 요일 인덱스 맵
        const dayIndexMap: Record<string, number> = {
          '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6
        };
        const sessionDayIndex = dayIndexMap[currentSession.day_of_week] ?? 0;
        
        // 시작일부터 오늘까지 해당 요일이 몇 번 지났는지 계산
        const postponedDates = currentSession.postponements?.map(
          (p: { postponed_date: string }) => p.postponed_date
        ) || [];
        
        let checkDate = new Date(startDate);
        while (checkDate <= today) {
          if (checkDate.getDay() === sessionDayIndex) {
            const dateStr = checkDate.toISOString().split('T')[0];
            // 연기된 날짜가 아니면 완료
            if (!postponedDates.includes(dateStr)) {
              completedLessons++;
            }
          }
          checkDate.setDate(checkDate.getDate() + 1);
        }
      }

      return {
        ...user,
        displayStatus,
        currentSession,
        dDay,
        extensionCount: extensionCount + 1, // 1회차부터 시작
        completedLessons: Math.min(completedLessons, 4),
        totalLessons: 4,
      };
    }) || [];

    // 상태 필터
    let filtered = usersWithStatus;
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'endingSoon') {
        filtered = usersWithStatus.filter(u => u.displayStatus === 'active' && u.dDay !== null && u.dDay <= 7);
      } else if (statusFilter === 'refundedCancelled') {
        filtered = usersWithStatus.filter(u => u.displayStatus === 'refunded' || u.displayStatus === 'cancelled');
      } else {
        filtered = usersWithStatus.filter(u => u.displayStatus === statusFilter);
      }
    }

    // 정렬
    let sorted = [...filtered];
    switch (sortBy) {
      case 'endingSoon':
        sorted.sort((a, b) => {
          if (a.dDay === null && b.dDay === null) return 0;
          if (a.dDay === null) return 1;
          if (b.dDay === null) return -1;
          return a.dDay - b.dDay;
        });
        break;
      case 'createdAt':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'coach':
        sorted.sort((a, b) => {
          const coachA = a.currentSession?.coach?.name || 'zzz';
          const coachB = b.currentSession?.coach?.name || 'zzz';
          return coachA.localeCompare(coachB);
        });
        break;
    }

    return NextResponse.json({ success: true, data: sorted });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 수강생 직접 추가 (수동등록)
export async function POST(req: Request) {
  const supabase = getServerClient();
  
  try {
    const body = await req.json();
    const { 
      name, 
      phone, 
      email, 
      memo, 
      manualEntryReason, 
      slotId, 
      paymentAmount 
    } = body;

    if (!name || !phone) {
      return NextResponse.json({ error: '이름과 전화번호는 필수입니다' }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone);
    
    if (!isValidPhone(normalizedPhone)) {
      return NextResponse.json({ error: '유효하지 않은 전화번호입니다' }, { status: 400 });
    }

    // 중복 체크
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('phone', normalizedPhone)
      .single();

    if (existing) {
      return NextResponse.json({ error: '이미 등록된 전화번호입니다' }, { status: 400 });
    }

    // 수강생 생성
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        name,
        phone: normalizedPhone,
        email: email || null,
        memo: memo || null,
        is_manual_entry: true,
        manual_entry_reason: manualEntryReason || MANUAL_ENTRY_REASON.OTHER,
      })
      .select()
      .single();

    if (userError) {
      console.error('수강생 생성 오류:', userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    // 슬롯이 선택된 경우 세션도 생성
    if (slotId) {
      const { data: slot } = await supabase
        .from('coach_slots')
        .select('*, coach:coaches(*)')
        .eq('id', slotId)
        .single();

      if (slot) {
        const startDate = calculateStartDate(slot.day_of_week as DayOfWeek);
        const endDate = calculateEndDate(startDate);

        const { data: session, error: sessionError } = await supabase
          .from('sessions')
          .insert({
            user_id: user.id,
            coach_id: slot.coach_id,
            slot_id: slot.id,
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            start_date: startDate,
            end_date: endDate,
            status: SESSION_STATUS.PENDING,
            payment_amount: paymentAmount || null,
          })
          .select()
          .single();

        if (sessionError) {
          console.error('세션 생성 오류:', sessionError);
        } else {
          // 활동 로그 기록
          await supabase.from('user_activity_logs').insert({
            user_id: user.id,
            session_id: session.id,
            action_type: ACTION_TYPE.ENROLL,
            reason: `수동등록: ${manualEntryReason || '기타'}`,
            metadata: {
              isManualEntry: true,
              slotId: slot.id,
              coach: slot.coach?.name,
            },
          });
        }
      }
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
