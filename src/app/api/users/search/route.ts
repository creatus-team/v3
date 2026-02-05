// app/api/users/search/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 수강생 검색 (이름으로)
export async function GET(req: Request) {
  const supabase = getServerClient();
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';

  if (!query || query.length < 1) {
    return NextResponse.json({ users: [] });
  }

  try {
    // 이름으로 검색 + 활성 세션 정보 포함
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id,
        name,
        phone,
        sessions(
          id,
          day_of_week,
          start_time,
          start_date,
          end_date,
          status,
          coach:coaches(id, name, phone),
          slot:coach_slots(open_chat_link)
        )
      `)
      .ilike('name', `%${query}%`)
      .limit(10);

    if (error) {
      console.error('수강생 검색 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 활성 세션이 있는 사용자만 필터링하고 세션 정보 정리
    const usersWithActiveSessions = users?.map(user => {
      const activeSessions = user.sessions?.filter(
        (s: { status: string }) => s.status === 'ACTIVE' || s.status === 'PENDING'
      ) || [];

      return {
        id: user.id,
        name: user.name,
        phone: user.phone,
        activeSessions: activeSessions.map((s: {
          id: string;
          day_of_week: string;
          start_time: string;
          start_date: string;
          end_date: string;
          status: string;
          coach: { id: string; name: string; phone: string } | { id: string; name: string; phone: string }[] | null;
          slot: { open_chat_link: string | null } | { open_chat_link: string | null }[] | null;
        }) => {
          const coach = Array.isArray(s.coach) ? s.coach[0] : s.coach;
          const slot = Array.isArray(s.slot) ? s.slot[0] : s.slot;
          return {
            id: s.id,
            dayOfWeek: s.day_of_week,
            startTime: s.start_time?.slice(0, 5),
            startDate: s.start_date,
            endDate: s.end_date,
            status: s.status,
            coachName: coach?.name || '',
            coachPhone: coach?.phone || '',
            openChatLink: slot?.open_chat_link || '',
          };
        }),
      };
    }) || [];

    return NextResponse.json({ users: usersWithActiveSessions });

  } catch (error) {
    console.error('수강생 검색 오류:', error);
    return NextResponse.json({ error: '검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
