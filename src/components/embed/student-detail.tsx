// src/components/embed/student-detail.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Phone, Calendar, Clock, User } from 'lucide-react';
import dayjs from '@/lib/dayjs';

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

interface ActivityLog {
  created_at: string;
  action_type: string;
  reason: string | null;
  metadata?: Record<string, unknown> | null;
}

interface StudentDetailProps {
  student: Student;
  onBack: () => void;
  formatPhone: (phone: string) => string;
  formatDate: (date: string) => string;
  getDday: (endDate: string) => string;
  getActionLabel: (actionType: string) => string;
}

export function StudentDetail({ 
  student, 
  onBack, 
  formatPhone, 
  formatDate, 
  getDday, 
  getActionLabel 
}: StudentDetailProps) {
  const [allLogs, setAllLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllLogs();
  }, [student.userId]);

  const fetchAllLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/embed/coach?coachId=_&tab=student-detail&userId=${student.userId}`);
      const data = await res.json();
      if (data.success) {
        setAllLogs(data.data);
      }
    } catch (error) {
      console.error('히스토리 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={onBack}
        className="text-slate-600 -ml-2"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        뒤로
      </Button>

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* 기본 정보 */}
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <User className="w-5 h-5 text-violet-600" />
              {student.name}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-slate-600">
              <Phone className="w-4 h-4" />
              <span>{formatPhone(student.phone)}</span>
            </div>
          </div>

          {/* 수업 정보 */}
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <h4 className="font-medium text-sm text-slate-700">수업 정보</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{student.dayOfWeek}요일 {student.startTime}</span>
              </div>
              <div>
                <Badge variant="outline">수업완료: {student.completedLessons}/4 (결제횟수: {student.extensionCount + 1}번)</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>{formatDate(student.startDate)} ~ {formatDate(dayjs(student.endDate).subtract(6, 'day').format('YYYY-MM-DD'))}</span>
              </div>
              <div>
                <Badge className={getDday(student.endDate) === '종료' ? 'bg-slate-100 text-slate-600' : 'bg-violet-100 text-violet-700'}>
                  {getDday(student.endDate)}
                </Badge>
              </div>
            </div>
          </div>

          {/* 연기 기록 */}
          {student.postponements.length > 0 && (
            <div className="bg-amber-50 rounded-lg p-3 space-y-2">
              <h4 className="font-medium text-sm text-amber-700">연기 기록</h4>
              <div className="space-y-1">
                {student.postponements.map((p, idx) => (
                  <div key={idx} className="text-sm text-amber-600">
                    • {formatDate(p.postponed_date)} {p.reason && `- ${p.reason}`}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 히스토리 */}
          <div className="border-t pt-3">
            <h4 className="font-medium text-sm text-slate-700 mb-2">히스토리</h4>
            {loading ? (
              <div className="flex justify-center py-2">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              </div>
            ) : allLogs.length > 0 ? (
              <div className="space-y-1">
                {allLogs.map((log, idx) => {
                  // ENROLL/RENEWAL은 결제일 표시, 나머지는 처리일 (관리자 대시보드와 동일)
                  const displayDate = (log.action_type === 'ENROLL' || log.action_type === 'RENEWAL')
                    && log.metadata && log.metadata.paymentDate
                    ? dayjs(log.metadata.paymentDate as string).format('M/D')
                    : dayjs(log.created_at).format('M/D');
                  return (
                  <div key={idx} className="text-sm text-slate-600 flex items-center gap-2">
                    <span className="text-slate-400">{displayDate}</span>
                    <span>{getActionLabel(log.action_type)}</span>
                    {log.reason && <span className="text-slate-400 text-xs">- {log.reason}</span>}
                  </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">히스토리가 없습니다</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
