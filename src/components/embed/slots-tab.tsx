// src/components/embed/slots-tab.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Circle, CheckCircle } from 'lucide-react';
import dayjs from '@/lib/dayjs';

interface SlotsTabProps {
  coachId: string;
}

interface Slot {
  id: string;
  dayOfWeek: string;
  startTime: string;
  isAvailable: boolean;
  studentName?: string;
  endDate?: string;
}

const DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일'];

export function SlotsTab({ coachId }: SlotsTabProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSlots();
  }, [coachId]);

  const fetchSlots = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/embed/coach?coachId=${coachId}&tab=slots`);
      const data = await res.json();
      if (data.success) {
        // 요일 + 시간순 정렬
        const sorted = data.data.sort((a: Slot, b: Slot) => {
          const dayDiff = DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek);
          if (dayDiff !== 0) return dayDiff;
          return a.startTime.localeCompare(b.startTime);
        });
        setSlots(sorted);
      }
    } catch (error) {
      console.error('슬롯 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return dayjs(date).format('M/D');
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

  // 요일별로 그룹핑
  const groupedSlots: Record<string, Slot[]> = {};
  for (const slot of slots) {
    if (!groupedSlots[slot.dayOfWeek]) {
      groupedSlots[slot.dayOfWeek] = [];
    }
    groupedSlots[slot.dayOfWeek].push(slot);
  }

  const availableCount = slots.filter(s => s.isAvailable).length;
  const occupiedCount = slots.filter(s => !s.isAvailable).length;

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600 font-medium">
        🕐 슬롯 현황
      </div>

      <div className="flex gap-3 text-sm">
        <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">
          비어있음 {availableCount}
        </Badge>
        <Badge variant="outline" className="bg-violet-50 text-violet-600 border-violet-200">
          배정됨 {occupiedCount}
        </Badge>
      </div>

      {slots.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            등록된 슬롯이 없습니다
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {DAY_ORDER.map((day) => {
            const daySlots = groupedSlots[day];
            if (!daySlots || daySlots.length === 0) return null;

            return (
              <Card key={day}>
                <CardContent className="p-3">
                  <h4 className="font-medium text-sm text-slate-700 mb-2">{day}요일</h4>
                  <div className="space-y-1.5">
                    {daySlots.map((slot) => (
                      <div 
                        key={slot.id} 
                        className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                          slot.isAvailable ? 'bg-emerald-50' : 'bg-violet-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {slot.isAvailable ? (
                            <Circle className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <CheckCircle className="w-3 h-3 text-violet-500" />
                          )}
                          <span className="font-medium">{slot.startTime}</span>
                        </div>
                        <div className="text-right">
                          {slot.isAvailable ? (
                            <span className="text-emerald-600">비어있음</span>
                          ) : (
                            <span className="text-violet-600">
                              {slot.studentName}
                              {slot.endDate && (
                                <span className="text-slate-400 ml-1">(~{formatDate(dayjs(slot.endDate).subtract(6, 'day').format('YYYY-MM-DD'))})</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
