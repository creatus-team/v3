// src/components/embed/students-tab.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronRight } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { StudentDetail } from './student-detail';

interface StudentsTabProps {
  coachId: string;
}

interface Student {
  sessionId: string;
  userId: string;
  name: string;
  phone: string;
  dayOfWeek: string;
  startTime: string;
  startDate: string;
  endDate: string;
  status: string;
  extensionCount: number;
  completedLessons: number;
  postponements: { postponed_date: string; reason: string | null }[];
  activityLogs: { created_at: string; action_type: string; reason: string | null; metadata?: Record<string, unknown> | null }[];
}

export function StudentsTab({ coachId }: StudentsTabProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  useEffect(() => {
    fetchStudents();
  }, [coachId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/embed/coach?coachId=${coachId}&tab=students`);
      const data = await res.json();
      if (data.success) {
        setStudents(data.data);
      }
    } catch (error) {
      console.error('수강생 조회 오류:', error);
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

  const getDday = (endDate: string) => {
    // 마지막 수업일 = end_date - 6일
    const lastLesson = dayjs(endDate).subtract(6, 'day');
    const diff = lastLesson.diff(dayjs(), 'day');
    if (diff < 0) return '종료';
    if (diff === 0) return 'D-Day';
    return `D-${diff}`;
  };

  const formatDate = (date: string) => {
    return dayjs(date).format('M/D');
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      ENROLL: '신규 등록',
      RENEWAL: '재결제',
      POSTPONE: '연기',
      CANCEL: '취소',
      REFUND: '환불',
      SLOT_CHANGE: '슬롯 변경',
    };
    return labels[actionType] || actionType;
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

  // 상세 보기 화면
  if (selectedStudent) {
    return (
      <StudentDetail 
        student={selectedStudent} 
        onBack={() => setSelectedStudent(null)}
        formatPhone={formatPhone}
        formatDate={formatDate}
        getDday={getDday}
        getActionLabel={getActionLabel}
      />
    );
  }

  // 목록 화면
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600 font-medium">
        👥 내 수강생 ({students.length}명)
      </div>

      {students.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            담당 수강생이 없습니다
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {students.map((student) => (
            <Card 
              key={student.sessionId} 
              className="cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setSelectedStudent(student)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{student.name}</div>
                    <div className="text-sm text-slate-500">
                      {student.dayOfWeek} {student.startTime} · 수업완료: {student.completedLessons}/4
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getDday(student.endDate) === '종료' ? 'bg-slate-100 text-slate-600' : 'bg-violet-100 text-violet-700'}>
                      {getDday(student.endDate)}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
