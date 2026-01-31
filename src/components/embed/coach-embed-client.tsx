// src/components/embed/coach-embed-client.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarDays, Users, Clock, Calendar } from 'lucide-react';
import { TodayTab } from './today-tab';
import { StudentsTab } from './students-tab';
import { SlotsTab } from './slots-tab';
import { CalendarTab } from './calendar-tab';

interface Coach {
  id: string;
  name: string;
}

interface CoachEmbedClientProps {
  coaches: Coach[];
}

type TabType = 'today' | 'students' | 'slots' | 'calendar';

export function CoachEmbedClient({ coaches }: CoachEmbedClientProps) {
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('today');

  // 첫 코치 자동 선택
  useEffect(() => {
    if (coaches.length > 0 && !selectedCoachId) {
      setSelectedCoachId(coaches[0].id);
    }
  }, [coaches, selectedCoachId]);

  const selectedCoach = coaches.find(c => c.id === selectedCoachId);

  const tabs = [
    { id: 'today' as TabType, label: '오늘', icon: CalendarDays },
    { id: 'students' as TabType, label: '수강생', icon: Users },
    { id: 'slots' as TabType, label: '슬롯', icon: Clock },
    { id: 'calendar' as TabType, label: '캘린더', icon: Calendar },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* 헤더 - 고정 */}
      <div className="flex-shrink-0 bg-white border-b shadow-sm">
        <div className="p-3">
          <Select value={selectedCoachId} onValueChange={setSelectedCoachId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="코치 선택" />
            </SelectTrigger>
            <SelectContent>
              {coaches.map((coach) => (
                <SelectItem key={coach.id} value={coach.id}>
                  {coach.name} 코치
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex border-t">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                  isActive 
                    ? 'text-violet-600 border-b-2 border-violet-600 bg-violet-50' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 탭 콘텐츠 - 스크롤 가능 */}
      <div className="flex-1 overflow-auto p-3">
        {!selectedCoachId ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-500">
              코치를 선택해주세요
            </CardContent>
          </Card>
        ) : (
          <>
            {activeTab === 'today' && (
              <TodayTab coachId={selectedCoachId} coachName={selectedCoach?.name || ''} />
            )}
            {activeTab === 'students' && (
              <StudentsTab coachId={selectedCoachId} />
            )}
            {activeTab === 'slots' && (
              <SlotsTab coachId={selectedCoachId} />
            )}
            {activeTab === 'calendar' && (
              <CalendarTab coachId={selectedCoachId} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
