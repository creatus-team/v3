// components/coaches/coaches-client.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  UserCircle, 
  Plus, 
  Copy,
  Pencil,
  Trash2,
  MessageSquare,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { formatPhoneDisplay } from "@/lib/utils/phone-normalizer";
import { DAYS_ARRAY } from "@/lib/constants";
import type { Coach, CoachSlot, Session } from "@/types";

interface CalendarLesson {
  sessionId: string;
  studentName: string;
  startTime: string;
  status: 'normal' | 'postponed' | 'refunded' | 'expired';
}

interface CalendarDay {
  date: string;
  dayOfWeek: string;
  lessons: CalendarLesson[];
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

interface ExtendedSlot extends CoachSlot {
  currentSession?: Session & { user?: { id: string; name: string; phone: string } };
}

interface ExtendedCoach extends Coach {
  slots: ExtendedSlot[];
  activeSlotCount: number;
  occupiedSlotCount: number;
}

interface CoachesClientProps {
  initialCoaches: ExtendedCoach[];
}

export function CoachesClient({ initialCoaches }: CoachesClientProps) {
  const router = useRouter();
  const [coaches] = useState<ExtendedCoach[]>(initialCoaches);
  const [selectedCoach, setSelectedCoach] = useState<ExtendedCoach | null>(
    initialCoaches[0] || null
  );
  const [slotFilter, setSlotFilter] = useState<'all' | 'active' | 'endingSoon' | 'empty'>('all');
  const [loading, setLoading] = useState(false);

  // 다이얼로그 상태
  const [isAddCoachOpen, setIsAddCoachOpen] = useState(false);
  const [isEditCoachOpen, setIsEditCoachOpen] = useState(false);
  const [isAddSlotOpen, setIsAddSlotOpen] = useState(false);
  const [isEditSlotOpen, setIsEditSlotOpen] = useState(false);
  const [deleteSlotConfirm, setDeleteSlotConfirm] = useState<ExtendedSlot | null>(null);
  const [extensionTarget, setExtensionTarget] = useState<ExtendedSlot | null>(null);

  // 새 코치 폼 상태
  const [coachForm, setCoachForm] = useState({
    name: '',
    phone: '',
    grade: 'REGULAR',
    bankAccount: '',
  });

  // 슬롯 폼 상태
  const [slotForm, setSlotForm] = useState({
    id: '',
    dayOfWeek: '월',
    startTime: '19:00',
    openChatLink: '',
  });

  // 캘린더 상태
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // 슬롯 수정 원본 (확인창용)
  const [originalSlot, setOriginalSlot] = useState<{
    dayOfWeek: string;
    startTime: string;
    hasStudent: boolean;
  } | null>(null);

  // 캘린더 데이터 로드
  useEffect(() => {
    if (!selectedCoach) return;
    
    const loadCalendar = async () => {
      setCalendarLoading(true);
      try {
        const res = await fetch(`/api/coaches/${selectedCoach.id}/calendar?month=${calendarMonth}`);
        const result = await res.json();
        if (result.success) {
          setCalendarData(result.data);
        }
      } catch (err) {
        console.error('캘린더 로드 오류:', err);
      } finally {
        setCalendarLoading(false);
      }
    };

    loadCalendar();
  }, [selectedCoach, calendarMonth]);

  // 월 변경
  const changeMonth = (delta: number) => {
    const [year, month] = calendarMonth.split('-').map(Number);
    const newDate = new Date(year, month - 1 + delta, 1);
    setCalendarMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
  };

  // 코치 추가
  const handleAddCoach = async () => {
    if (!coachForm.name) return;
    setLoading(true);

    try {
      const res = await fetch('/api/coaches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coachForm),
      });

      const result = await res.json();

      if (result.success) {
        router.refresh();
        setIsAddCoachOpen(false);
        setCoachForm({ name: '', phone: '', grade: 'REGULAR', bankAccount: '' });
        if (result.warning) alert(result.warning);
      } else {
        alert(result.error);
      }
    } catch {
      alert('코치 추가 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  // 코치 수정 다이얼로그 열기
  const openEditCoach = (coach: ExtendedCoach) => {
    setCoachForm({
      name: coach.name,
      phone: coach.phone || '',
      grade: coach.grade,
      bankAccount: coach.bank_account || '',
    });
    setIsEditCoachOpen(true);
  };

  // 코치 수정
  const handleEditCoach = async () => {
    if (!selectedCoach || !coachForm.name) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/coaches/${selectedCoach.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coachForm),
      });

      const result = await res.json();

      if (result.success) {
        router.refresh();
        setIsEditCoachOpen(false);
      } else {
        alert(result.error);
      }
    } catch {
      alert('코치 수정 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  // 슬롯 추가
  const handleAddSlot = async () => {
    if (!selectedCoach || !slotForm.dayOfWeek || !slotForm.startTime) return;
    setLoading(true);

    try {
      const res = await fetch('/api/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: selectedCoach.id,
          dayOfWeek: slotForm.dayOfWeek,
          startTime: slotForm.startTime,
          openChatLink: slotForm.openChatLink,
        }),
      });

      const result = await res.json();

      if (result.success) {
        router.refresh();
        setIsAddSlotOpen(false);
        setSlotForm({ id: '', dayOfWeek: '월', startTime: '19:00', openChatLink: '' });
      } else {
        alert(result.error);
      }
    } catch {
      alert('슬롯 추가 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  // 슬롯 수정 다이얼로그 열기
  const openEditSlot = (slot: ExtendedSlot) => {
    setSlotForm({
      id: slot.id,
      dayOfWeek: slot.day_of_week,
      startTime: slot.start_time?.slice(0, 5) || '19:00',
      openChatLink: slot.open_chat_link || '',
    });
    setOriginalSlot({
      dayOfWeek: slot.day_of_week,
      startTime: slot.start_time?.slice(0, 5) || '19:00',
      hasStudent: !!slot.currentSession,
    });
    setIsEditSlotOpen(true);
  };

  // 슬롯 수정
  const handleEditSlot = async () => {
    if (!slotForm.id) return;

    // 시간이 변경되었고 수강생이 있는 경우 확인
    const isTimeChanged = originalSlot && (
      slotForm.dayOfWeek !== originalSlot.dayOfWeek || 
      slotForm.startTime !== originalSlot.startTime
    );
    
    if (isTimeChanged && originalSlot?.hasStudent) {
      const confirmed = window.confirm(
        `시간이 ${originalSlot.dayOfWeek} ${originalSlot.startTime} → ${slotForm.dayOfWeek} ${slotForm.startTime}로 변경됩니다.\n\n수강생에게 알림 문자가 발송됩니다.\n계속하시겠습니까?`
      );
      if (!confirmed) return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/slots/${slotForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayOfWeek: slotForm.dayOfWeek,
          startTime: slotForm.startTime,
          openChatLink: slotForm.openChatLink,
        }),
      });

      const result = await res.json();

      if (result.success) {
        router.refresh();
        setIsEditSlotOpen(false);
      } else {
        alert(result.error);
      }
    } catch {
      alert('슬롯 수정 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  // 슬롯 삭제
  const handleDeleteSlot = async () => {
    if (!deleteSlotConfirm) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/slots/${deleteSlotConfirm.id}`, {
        method: 'DELETE',
      });

      const result = await res.json();

      if (result.success) {
        router.refresh();
        setDeleteSlotConfirm(null);
      } else {
        alert(result.error);
      }
    } catch {
      alert('슬롯 삭제 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  // 연장 권유 문자 발송
  const handleSendExtensionSms = async () => {
    if (!extensionTarget?.currentSession) return;
    setLoading(true);

    try {
      const res = await fetch('/api/notify/extension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: extensionTarget.currentSession.id,
        }),
      });

      const result = await res.json();

      if (result.success) {
        alert('연장 권유 문자가 발송되었습니다.');
        setExtensionTarget(null);
      } else {
        alert(result.error || '문자 발송에 실패했습니다.');
      }
    } catch {
      alert('문자 발송 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('링크가 복사되었습니다.');
  };

  // 슬롯 필터링
  const filteredSlots = selectedCoach?.slots.filter(slot => {
    switch (slotFilter) {
      case 'active':
        return slot.currentSession?.status === 'ACTIVE';
      case 'endingSoon':
        if (!slot.currentSession?.end_date) return false;
        // 마지막 수업일 = end_date - 6일
        const lastLesson = new Date(slot.currentSession.end_date);
        lastLesson.setDate(lastLesson.getDate() - 6);
        const dDay = Math.ceil(
          (lastLesson.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );
        return dDay <= 7 && dDay >= 0;
      case 'empty':
        return !slot.currentSession;
      default:
        return true;
    }
  }) || [];

  // D-Day 계산
  const calcDDay = (endDate: string) => {
    // 마지막 수업일 = end_date - 6일
    const lastLesson = new Date(endDate);
    lastLesson.setDate(lastLesson.getDate() - 6);
    const d = Math.ceil((lastLesson.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (d < 0) return `D+${Math.abs(d)}`;
    if (d === 0) return 'D-Day';
    return `D-${d}`;
  };

  const gradeLabels: Record<string, { label: string; color: string }> = {
    TRAINEE: { label: '견습', color: 'bg-orange-100 text-orange-700' },
    REGULAR: { label: '정식', color: 'bg-blue-100 text-blue-700' },
    SENIOR: { label: '선임', color: 'bg-purple-100 text-purple-700' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">코치 관리</h1>
        <Button onClick={() => setIsAddCoachOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          코치 추가
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 코치 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">코치 목록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {coaches.map((coach) => (
              <button
                key={coach.id}
                onClick={() => setSelectedCoach(coach)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedCoach?.id === coach.id
                    ? 'bg-violet-100 border-violet-300 border'
                    : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCircle className="w-8 h-8 text-slate-400" />
                    <div>
                      <p className="font-medium">{coach.name}</p>
                      <p className="text-sm text-slate-500">
                        {formatPhoneDisplay(coach.phone || '')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className={gradeLabels[coach.grade]?.color || ''}>
                      {gradeLabels[coach.grade]?.label || coach.grade}
                    </Badge>
                    <p className="text-xs text-slate-500 mt-1">
                      {coach.occupiedSlotCount}/{coach.activeSlotCount} 슬롯
                    </p>
                  </div>
                </div>
              </button>
            ))}
            {coaches.length === 0 && (
              <p className="text-slate-500 text-center py-8">
                등록된 코치가 없습니다
              </p>
            )}
          </CardContent>
        </Card>

        {/* 슬롯 상세 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {selectedCoach ? `${selectedCoach.name} 코치의 슬롯` : '코치를 선택하세요'}
              </CardTitle>
              {selectedCoach && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEditCoach(selectedCoach)}>
                    <Pencil className="w-4 h-4 mr-1" />
                    수정
                  </Button>
                  <Button size="sm" onClick={() => setIsAddSlotOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    슬롯 추가
                  </Button>
                </div>
              )}
            </div>
            {selectedCoach && (
              <div className="flex gap-2 mt-3">
                {(['all', 'active', 'endingSoon', 'empty'] as const).map((filter) => {
                  const labels = {
                    all: `전체 ${selectedCoach.slots.length}`,
                    active: `진행중 ${selectedCoach.slots.filter(s => s.currentSession?.status === 'ACTIVE').length}`,
                    endingSoon: '종료예정',
                    empty: `빈슬롯 ${selectedCoach.slots.filter(s => !s.currentSession).length}`,
                  };
                  return (
                    <Button
                      key={filter}
                      size="sm"
                      variant={slotFilter === filter ? 'default' : 'outline'}
                      onClick={() => setSlotFilter(filter)}
                    >
                      {labels[filter]}
                    </Button>
                  );
                })}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!selectedCoach ? (
              <p className="text-slate-500 text-center py-8">
                왼쪽에서 코치를 선택하세요
              </p>
            ) : filteredSlots.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                {slotFilter === 'all' ? '등록된 슬롯이 없습니다' : '해당하는 슬롯이 없습니다'}
              </p>
            ) : (
              <div className="space-y-3">
                {filteredSlots.map((slot) => {
                  const session = slot.currentSession;
                  const isEmpty = !session;
                  const isEndingSoon = session?.end_date && 
                    Math.ceil((new Date(new Date(session.end_date).getTime() - 6 * 86400000).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) <= 7;

                  return (
                    <div
                      key={slot.id}
                      className={`p-4 rounded-lg border ${
                        isEmpty
                          ? 'bg-slate-50 border-slate-200'
                          : isEndingSoon
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-emerald-50 border-emerald-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {isEmpty ? (
                              <span className="w-3 h-3 rounded-full bg-slate-400" />
                            ) : isEndingSoon ? (
                              <span className="w-3 h-3 rounded-full bg-amber-500" />
                            ) : (
                              <span className="w-3 h-3 rounded-full bg-emerald-500" />
                            )}
                            <span className="font-medium">
                              {slot.day_of_week}요일 {slot.start_time?.slice(0, 5)}~{slot.end_time?.slice(0, 5)}
                            </span>
                            {isEndingSoon && (
                              <Badge variant="warning">종료예정</Badge>
                            )}
                          </div>
                          
                          {session ? (
                            <div className="mt-2 ml-5 text-sm">
                              <p>
                                수강생: <span className="font-medium">{session.user?.name}</span>
                                <span className="text-slate-500 ml-2">
                                  ({formatPhoneDisplay(session.user?.phone || '')})
                                </span>
                              </p>
                              <p className="text-slate-500">
                                종료일: {(() => {
                                  const d = new Date(session.end_date);
                                  d.setDate(d.getDate() - 6);
                                  return d.toISOString().split('T')[0];
                                })()}
                                {session.end_date && (
                                  <span className={`ml-2 font-medium ${isEndingSoon ? 'text-amber-600' : ''}`}>
                                    ({calcDDay(session.end_date)})
                                  </span>
                                )}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-2 ml-5 text-sm text-slate-500">빈 슬롯</p>
                          )}
                        </div>

                        <div className="flex gap-1">
                          {slot.open_chat_link && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(slot.open_chat_link || '')}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openEditSlot(slot)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {isEmpty ? (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-red-500"
                              onClick={() => setDeleteSlotConfirm(slot)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          ) : isEndingSoon && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="text-blue-500"
                              onClick={() => setExtensionTarget(slot)}
                            >
                              <MessageSquare className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 코치 캘린더 */}
      {selectedCoach && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {selectedCoach.name} 코치 캘린더
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => changeMonth(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="font-medium min-w-[100px] text-center">
                  {calendarMonth.replace('-', '년 ')}월
                </span>
                <Button size="sm" variant="outline" onClick={() => changeMonth(1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {calendarData && (
              <div className="flex gap-4 mt-2 text-sm text-slate-600">
                <span>이번 달 코칭: <strong className="text-emerald-600">{calendarData.summary.coachingCount}회</strong></span>
                <span>연기: <strong className="text-amber-600">{calendarData.summary.postponedCount}회</strong></span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {calendarLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : calendarData && calendarData.days.length > 0 ? (
              <div className="grid grid-cols-7 gap-1">
                {/* 요일 헤더 */}
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-slate-500 py-1">
                    {day}
                  </div>
                ))}
                {/* 날짜 셀 */}
                {(() => {
                  const [year, month] = calendarMonth.split('-').map(Number);
                  const firstDay = new Date(year, month - 1, 1).getDay();
                  const lastDate = new Date(year, month, 0).getDate();
                  const cells = [];
                  
                  // 빈 셀
                  for (let i = 0; i < firstDay; i++) {
                    cells.push(<div key={`empty-${i}`} className="h-16" />);
                  }
                  
                  // 날짜 셀
                  for (let date = 1; date <= lastDate; date++) {
                    const dateStr = `${calendarMonth}-${String(date).padStart(2, '0')}`;
                    const dayData = calendarData.days.find(d => d.date === dateStr);
                    const isToday = dateStr === new Date().toISOString().split('T')[0];
                    
                    cells.push(
                      <div 
                        key={date} 
                        className={`h-16 p-1 border rounded text-xs ${
                          isToday ? 'border-violet-400 bg-violet-50' : 'border-slate-200'
                        }`}
                      >
                        <div className={`font-medium ${isToday ? 'text-violet-600' : ''}`}>{date}</div>
                        {dayData && dayData.lessons.map((lesson, idx) => (
                          <div 
                            key={idx}
                            className={`truncate text-[10px] mt-0.5 px-1 rounded ${
                              lesson.status === 'postponed' 
                                ? 'bg-amber-100 text-amber-700 line-through' 
                                : lesson.status === 'normal'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                            title={`${lesson.startTime} ${lesson.studentName}`}
                          >
                            {lesson.startTime} {lesson.studentName}
                          </div>
                        ))}
                      </div>
                    );
                  }
                  
                  return cells;
                })()}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">
                이번 달 수업이 없습니다
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 코치 추가 다이얼로그 */}
      <Dialog open={isAddCoachOpen} onOpenChange={setIsAddCoachOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 코치 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>이름 *</Label>
              <Input
                value={coachForm.name}
                onChange={(e) => setCoachForm({ ...coachForm, name: e.target.value })}
                placeholder="코치 이름"
              />
            </div>
            <div className="space-y-2">
              <Label>전화번호</Label>
              <Input
                value={coachForm.phone}
                onChange={(e) => setCoachForm({ ...coachForm, phone: e.target.value })}
                placeholder="01012345678"
              />
            </div>
            <div className="space-y-2">
              <Label>등급</Label>
              <Select
                value={coachForm.grade}
                onValueChange={(v) => setCoachForm({ ...coachForm, grade: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRAINEE">견습 (4만원/회)</SelectItem>
                  <SelectItem value="REGULAR">정식 (5만원/회)</SelectItem>
                  <SelectItem value="SENIOR">선임 (7.5만원/회)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>계좌번호</Label>
              <Input
                value={coachForm.bankAccount}
                onChange={(e) => setCoachForm({ ...coachForm, bankAccount: e.target.value })}
                placeholder="국민 123-456-789012"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddCoachOpen(false)}>취소</Button>
            <Button onClick={handleAddCoach} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 코치 수정 다이얼로그 */}
      <Dialog open={isEditCoachOpen} onOpenChange={setIsEditCoachOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>코치 정보 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>이름 *</Label>
              <Input
                value={coachForm.name}
                onChange={(e) => setCoachForm({ ...coachForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>전화번호</Label>
              <Input
                value={coachForm.phone}
                onChange={(e) => setCoachForm({ ...coachForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>등급</Label>
              <Select
                value={coachForm.grade}
                onValueChange={(v) => setCoachForm({ ...coachForm, grade: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRAINEE">견습 (4만원/회)</SelectItem>
                  <SelectItem value="REGULAR">정식 (5만원/회)</SelectItem>
                  <SelectItem value="SENIOR">선임 (7.5만원/회)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>계좌번호</Label>
              <Input
                value={coachForm.bankAccount}
                onChange={(e) => setCoachForm({ ...coachForm, bankAccount: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditCoachOpen(false)}>취소</Button>
            <Button onClick={handleEditCoach} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 슬롯 추가 다이얼로그 */}
      <Dialog open={isAddSlotOpen} onOpenChange={setIsAddSlotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 슬롯 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>요일</Label>
              <Select
                value={slotForm.dayOfWeek}
                onValueChange={(v) => setSlotForm({ ...slotForm, dayOfWeek: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_ARRAY.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}요일
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>시작 시간</Label>
              <Input
                type="time"
                value={slotForm.startTime}
                onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>오픈톡 링크</Label>
              <Input
                value={slotForm.openChatLink}
                onChange={(e) => setSlotForm({ ...slotForm, openChatLink: e.target.value })}
                placeholder="https://open.kakao.com/..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddSlotOpen(false)}>취소</Button>
            <Button onClick={handleAddSlot} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 슬롯 수정 다이얼로그 */}
      <Dialog open={isEditSlotOpen} onOpenChange={setIsEditSlotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>슬롯 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>요일</Label>
              <Select
                value={slotForm.dayOfWeek}
                onValueChange={(v) => setSlotForm({ ...slotForm, dayOfWeek: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_ARRAY.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}요일
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>시작 시간</Label>
              <Input
                type="time"
                value={slotForm.startTime}
                onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>오픈톡 링크</Label>
              <Input
                value={slotForm.openChatLink}
                onChange={(e) => setSlotForm({ ...slotForm, openChatLink: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditSlotOpen(false)}>취소</Button>
            <Button onClick={handleEditSlot} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 슬롯 삭제 확인 */}
      <AlertDialog open={!!deleteSlotConfirm} onOpenChange={() => setDeleteSlotConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>슬롯 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteSlotConfirm?.day_of_week}요일 {deleteSlotConfirm?.start_time?.slice(0, 5)} 슬롯을 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSlot} className="bg-red-600 hover:bg-red-700">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 연장 권유 문자 확인 */}
      <AlertDialog open={!!extensionTarget} onOpenChange={() => setExtensionTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>연장 권유 문자 발송</AlertDialogTitle>
            <AlertDialogDescription>
              {extensionTarget?.currentSession?.user?.name}님에게 연장 권유 문자를 발송하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendExtensionSms}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              발송
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
