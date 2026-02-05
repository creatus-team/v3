// src/components/embed/today-tab.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, Sparkles } from 'lucide-react';
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
  completedLessons: number;
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
      const res = await fetch(`/api/embed/coach?coachId=${coachId}&tab=today`);
      const data = await res.json();
      if (data.success) {
        setLessons(data.data);
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
                    수업완료: {lesson.completedLessons}/4
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
