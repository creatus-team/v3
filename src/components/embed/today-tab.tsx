// src/components/embed/today-tab.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, Sparkles } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import dayjs from '@/lib/dayjs';

interface TodayTabProps {
  coachId: string;
  coachName: string;
}

interface TodayLesson {
  sessionId: string;
  studentName: string;
  studentPhone: string;
  startTime: string;
  extensionCount: number;
  isFirstLesson: boolean;
}

export function TodayTab({ coachId, coachName }: TodayTabProps) {
  const [lessons, setLessons] = useState<TodayLesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTodayLessons();
  }, [coachId]);

  const fetchTodayLessons = async () => {
    setLoading(true);
    try {
      const supabase = getBrowserClient();
      const today = dayjs().format('YYYY-MM-DD');
      const todayDayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dayjs().day()];

      // 오늘 해당 요일의 활성 세션 조회
      const { data: sessions } = await supabase
        .from('sessions')
        .select(`
          id,
          start_time,
          start_date,
          extension_count,
          user:users(name, phone),
          postponements(postponed_date)
        `)
        .eq('coach_id', coachId)
        .eq('day_of_week', todayDayOfWeek)
        .in('status', ['ACTIVE', 'PENDING'])
        .lte('start_date', today)
        .gte('end_date', today);

      if (sessions) {
        const todayLessons: TodayLesson[] = [];

        for (const session of sessions) {
          // 오늘이 연기된 날인지 확인
          const postponedDates = session.postponements?.map((p: { postponed_date: string }) => p.postponed_date) || [];
          if (postponedDates.includes(today)) continue;

          // user가 배열로 올 수 있으므로 처리
          const user = Array.isArray(session.user) ? session.user[0] : session.user;

          // 첫 수업인지 확인 (시작일 = 오늘)
          const isFirstLesson = session.start_date === today;

          todayLessons.push({
            sessionId: session.id,
            studentName: user?.name || '알수없음',
            studentPhone: user?.phone || '',
            startTime: session.start_time?.slice(0, 5) || '',
            extensionCount: session.extension_count || 0,
            isFirstLesson,
          });
        }

        // 시간순 정렬
        todayLessons.sort((a, b) => a.startTime.localeCompare(b.startTime));
        setLessons(todayLessons);
      }
    } catch (error) {
      console.error('오늘 수업 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  const todayStr = dayjs().format('M월 D일 (ddd)');

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600 font-medium">
        📅 {todayStr} 수업
      </div>

      {lessons.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            오늘은 수업이 없습니다 😊
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {lessons.map((lesson) => (
            <Card key={lesson.sessionId} className="overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-violet-600">{lesson.startTime}</span>
                      <span className="font-medium">{lesson.studentName}</span>
                      {lesson.isFirstLesson && (
                        <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5">
                          <Sparkles className="w-3 h-3 mr-0.5" />
                          첫수업
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-sm text-slate-500">
                      <Phone className="w-3 h-3" />
                      <span>{formatPhone(lesson.studentPhone)}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {lesson.extensionCount + 1}회차
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-xs text-slate-400 text-center mt-4">
        총 {lessons.length}건의 수업
      </div>
    </div>
  );
}
