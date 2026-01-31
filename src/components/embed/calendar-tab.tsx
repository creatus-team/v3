// src/components/embed/calendar-tab.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import dayjs from '@/lib/dayjs';

interface CalendarTabProps {
  coachId: string;
}

interface CalendarDay {
  date: string;
  dayOfWeek: string;
  lessons: {
    sessionId: string;
    studentName: string;
    startTime: string;
    status: 'normal' | 'postponed' | 'refunded' | 'expired';
  }[];
}

interface CalendarData {
  month: string;
  days: CalendarDay[];
  summary: {
    coachingCount: number;
    postponedCount: number;
    totalScheduled: number;
  };
}

export function CalendarTab({ coachId }: CalendarTabProps) {
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(dayjs().format('YYYY-MM'));

  useEffect(() => {
    fetchCalendar();
  }, [coachId, currentMonth]);

  const fetchCalendar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/coaches/${coachId}/calendar?month=${currentMonth}`);
      const data = await res.json();
      if (data.success) {
        setCalendarData(data.data);
      }
    } catch (error) {
      console.error('캘린더 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const changeMonth = (direction: 'prev' | 'next') => {
    const current = dayjs(currentMonth + '-01');
    const newMonth = direction === 'prev' 
      ? current.subtract(1, 'month') 
      : current.add(1, 'month');
    setCurrentMonth(newMonth.format('YYYY-MM'));
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

  const monthStart = dayjs(currentMonth + '-01');
  const daysInMonth = monthStart.daysInMonth();
  const startDayOfWeek = monthStart.day(); // 0 = 일요일
  const today = dayjs().format('YYYY-MM-DD');

  // 캘린더 날짜별 데이터 맵 생성
  const dayDataMap: Record<string, CalendarDay> = {};
  if (calendarData) {
    for (const day of calendarData.days) {
      dayDataMap[day.date] = day;
    }
  }

  // 캘린더 셀 생성
  const cells: JSX.Element[] = [];
  
  // 빈 셀 (월 시작 전)
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(<div key={`empty-${i}`} className="h-16 bg-slate-50"></div>);
  }

  // 날짜 셀
  for (let date = 1; date <= daysInMonth; date++) {
    const dateStr = monthStart.date(date).format('YYYY-MM-DD');
    const dayData = dayDataMap[dateStr];
    const isToday = dateStr === today;

    cells.push(
      <div 
        key={date}
        className={`min-h-16 p-0.5 border border-slate-100 ${
          isToday ? 'bg-violet-50 border-violet-300' : ''
        }`}
      >
        <div className={`text-[10px] font-medium mb-0.5 ${isToday ? 'text-violet-600' : 'text-slate-600'}`}>
          {date}
        </div>
        {dayData && (
          <div className="grid grid-cols-2 gap-0.5">
            {dayData.lessons.map((lesson, idx) => (
              <div 
                key={idx}
                className={`text-[7px] leading-tight px-0.5 py-0.5 rounded ${
                  lesson.status === 'postponed' 
                    ? 'bg-amber-100 text-amber-700 line-through' 
                    : lesson.status === 'normal'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
                title={`${lesson.startTime} ${lesson.studentName}`}
              >
                {lesson.startTime.slice(0, 2)}시 {lesson.studentName.slice(0, 3)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const [year, month] = currentMonth.split('-');

  return (
    <div className="space-y-3">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => changeMonth('prev')}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-medium">{year}년 {parseInt(month)}월</span>
        <Button variant="ghost" size="sm" onClick={() => changeMonth('next')}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* 요약 */}
      {calendarData && (
        <div className="flex gap-2 justify-center">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">
            수업 {calendarData.summary.coachingCount}회
          </Badge>
          {calendarData.summary.postponedCount > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
              연기 {calendarData.summary.postponedCount}회
            </Badge>
          )}
        </div>
      )}

      {/* 캘린더 */}
      <Card>
        <CardContent className="p-2">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500 mb-1">
            <div className="text-red-400">일</div>
            <div>월</div>
            <div>화</div>
            <div>수</div>
            <div>목</div>
            <div>금</div>
            <div className="text-blue-400">토</div>
          </div>

          {/* 캘린더 그리드 */}
          <div className="grid grid-cols-7 gap-px bg-slate-200">
            {cells}
          </div>
        </CardContent>
      </Card>

      {/* 범례 */}
      <div className="flex gap-3 justify-center text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-emerald-100"></div>
          <span>수업</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-100"></div>
          <span>연기</span>
        </div>
      </div>
    </div>
  );
}
