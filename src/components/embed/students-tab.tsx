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
  const [error, setError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  useEffect(() => {
    fetchStudents();
  }, [coachId]);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/embed/coach?coachId=${coachId}&tab=students`);
      const data = await res.json();
      if (data.success) {
        setStudents(data.data);
      } else {
        setError(data.error || '수강생 목록을 불러오지 못했습니다');
      }
    } catch (err) {
      console.error('수강생 조회 오류:', err);
      setError('네트워크 오류가 발생했습니다');
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
    const lastLesson = dayjs(endDate).tz('Asia/Seoul').subtract(6, 'day').startOf('day');
    const today = dayjs().tz('Asia/Seoul').startOf('day');
    const diff = lastLesson.diff(today, 'day');
    if (diff < 0) return `D+${Math.abs(diff)}`;
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
      SLOT_TIME_CHANGE: '시간 변경',
      EARLY_TERMINATE: '조기종료',
      EDIT: '정보 수정',
      USER_MERGE: '회원 병합',
    };
    return labels[actionType] || actionType;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      CANCELLED: '취소',
      REFUNDED: '환불',
      EARLY_TERMINATED: '조기종료',
      COMPLETED: '종료',
    };
    return labels[status] || '종료';
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

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-500">
          {error}
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

  // 현재 수강생 / 이전 수강생 분리
  const activeStudents = students.filter(s => s.status === 'ACTIVE' || s.status === 'PENDING');
  const pastStudents = students.filter(s => s.status !== 'ACTIVE' && s.status !== 'PENDING');

  // 목록 화면
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600 font-medium">
        \uD83D\uDC65 내 수강생 ({activeStudents.length}명)
      </div>

      {activeStudents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            담당 수강생이 없습니다
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activeStudents.map((student) => {
            const dday = getDday(student.endDate);
            return (
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
                      <Badge className={dday.startsWith('D+') ? 'bg-slate-100 text-slate-600' : 'bg-violet-100 text-violet-700'}>
                        {dday}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 이전 수강생 섹션 */}
      {pastStudents.length > 0 && (
        <>
          <div className="text-sm text-slate-400 font-medium mt-6">
            이전 수강생 ({pastStudents.length}명)
          </div>
          <div className="space-y-2">
            {pastStudents.map((student) => {
              const dday = getDday(student.endDate);
              return (
                <Card
                  key={student.sessionId}
                  className="cursor-pointer hover:bg-slate-50 transition-colors opacity-60"
                  onClick={() => setSelectedStudent(student)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-slate-500">{student.name}</div>
                        <div className="text-sm text-slate-400">
                          {student.dayOfWeek} {student.startTime}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-500">
                          {getStatusLabel(student.status)}
                        </Badge>
                        <span className="text-xs text-slate-400">{dday}</span>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
