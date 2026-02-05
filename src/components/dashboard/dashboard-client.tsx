// components/dashboard/dashboard-client.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Calendar, 
  Clock, 
  Inbox, 
  Users, 
  AlertCircle,
  RefreshCw,
  CheckCircle,
  XCircle,
  RotateCcw,
  Loader2,
  MapPin,
  MessageSquare,
} from "lucide-react";
import { formatPhoneDisplay } from "@/lib/utils/phone-normalizer";
import { getBrowserClient } from "@/lib/supabase/client";
import type { DashboardKPI, TodayLesson, InboxItem } from "@/types";

interface DashboardData {
  kpi: DashboardKPI;
  todayLessons: TodayLesson[];
  inboxItems: InboxItem[];
  date: string;
  dayOfWeek: string;
}

interface DashboardClientProps {
  initialData: DashboardData;
}

interface Slot {
  id: string;
  day_of_week: string;
  start_time: string;
  coach: { id: string; name: string };
}

interface RefundSession {
  id: string;
  day_of_week: string;
  start_time: string;
  start_date: string;
  end_date: string;
  extension_count: number;
  status: string;
  coach: { name: string };
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 수동 배정 다이얼로그
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<InboxItem | null>(null);
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");

  // 환불 세션 선택 다이얼로그
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<InboxItem | null>(null);
  const [refundSessions, setRefundSessions] = useState<RefundSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [includeTodayLesson, setIncludeTodayLesson] = useState(true); // 당일 수업 정산 포함 여부

  // Tally 매칭 다이얼로그
  const [tallyMatchOpen, setTallyMatchOpen] = useState(false);
  const [tallyMatchTarget, setTallyMatchTarget] = useState<InboxItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    id: string;
    name: string;
    phone: string;
    activeSessions: {
      id: string;
      dayOfWeek: string;
      startTime: string;
      coachName: string;
    }[];
  }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  // Realtime 구독
  useEffect(() => {
    const supabase = getBrowserClient();
    
    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingestion_inbox' }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_logs' }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // initialData가 변경되면 state 업데이트
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const refreshData = async () => {
    setLoading(true);
    try {
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleInboxAction = async (id: string, action: 'resolved' | 'ignored') => {
    try {
      const res = await fetch('/api/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: action.toUpperCase() }),
      });

      if (res.ok) {
        setData(prev => ({
          ...prev,
          inboxItems: prev.inboxItems.filter(item => item.id !== id),
          kpi: {
            ...prev.kpi,
            inboxCount: Math.max(0, prev.kpi.inboxCount - 1),
          },
        }));
      }
    } catch (error) {
      console.error('인박스 처리 오류:', error);
    }
  };

  // 재처리
  const handleReprocess = async (item: InboxItem) => {
    setActionLoading(item.id);
    try {
      const res = await fetch('/api/inbox/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxId: item.id }),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        alert(result.data?.message || '재처리가 완료되었습니다.');
        router.refresh();
      } else {
        alert(result.error || result.detail || '재처리에 실패했습니다.');
      }
    } catch (error) {
      console.error('재처리 오류:', error);
      alert('재처리 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // 환불 모달 열기 - 세션 목록 조회
  const openRefundModal = async (item: InboxItem) => {
    setRefundTarget(item);
    setSelectedSessionId("");
    setRefundOpen(true);

    // 전화번호로 세션 조회
    try {
      const supabase = getBrowserClient();
      const phoneRaw = item.raw_webhook?.payload?.['전화번호'] || item.raw_webhook?.payload?.phone;
      
      if (!phoneRaw) {
        alert('전화번호 정보가 없습니다.');
        setRefundOpen(false);
        return;
      }

      // 전화번호 정규화
      const phone = String(phoneRaw);
      const normalizedPhone = phone.replace(/[^0-9]/g, '');
      const formattedPhone = normalizedPhone.startsWith('0') ? normalizedPhone : '0' + normalizedPhone;

      // 수강생 찾기
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('phone', formattedPhone)
        .single();

      if (!user) {
        alert('해당 전화번호의 수강생을 찾을 수 없습니다.');
        setRefundSessions([]);
        return;
      }

      // 활성 세션 조회
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, day_of_week, start_time, start_date, end_date, extension_count, status, coach:coaches(name)')
        .eq('user_id', user.id)
        .in('status', ['ACTIVE', 'PENDING'])
        .order('extension_count', { ascending: false });

      setRefundSessions(sessions as unknown as RefundSession[] || []);
    } catch (error) {
      console.error('세션 조회 오류:', error);
      setRefundSessions([]);
    }
  };

  // 환불 처리 (세션 선택 후)
  const handleRefund = async () => {
    if (!refundTarget || !selectedSessionId) {
      alert('환불할 세션을 선택해주세요.');
      return;
    }

    const confirmMessage = includeTodayLesson 
      ? '정말 환불 처리하시겠습니까?\n\n✅ 당일 수업이 정산에 포함됩니다.'
      : '정말 환불 처리하시겠습니까?\n\n❌ 당일 수업이 정산에서 제외됩니다.';

    if (!confirm(confirmMessage)) {
      return;
    }
    
    setActionLoading(refundTarget.id);
    try {
      const res = await fetch('/api/inbox/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          inboxId: refundTarget.id,
          sessionId: selectedSessionId,
          includeTodayLesson,
        }),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        alert(result.message || '환불 처리가 완료되었습니다.');
        setRefundOpen(false);
        setIncludeTodayLesson(true); // 리셋
        router.refresh();
      } else {
        alert(result.error || '환불 처리에 실패했습니다.');
      }
    } catch (error) {
      console.error('환불 처리 오류:', error);
      alert('환불 처리 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // Tally 매칭 다이얼로그 열기
  const openTallyMatchModal = (item: InboxItem) => {
    setTallyMatchTarget(item);
    setSearchQuery(item.metadata?.name || '');
    setSearchResults([]);
    setSelectedUserId("");
    setTallyMatchOpen(true);
    
    // 이름이 있으면 자동 검색
    if (item.metadata?.name) {
      searchUsers(item.metadata.name);
    }
  };

  // 수강생 검색
  const searchUsers = async (query: string) => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      
      if (res.ok) {
        setSearchResults(data.users || []);
      }
    } catch (error) {
      console.error('수강생 검색 오류:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  // Tally 매칭 및 문자 발송
  const handleTallyMatch = async () => {
    if (!tallyMatchTarget || !selectedUserId) {
      alert('수강생을 선택해주세요.');
      return;
    }

    const selectedUser = searchResults.find(u => u.id === selectedUserId);
    if (!confirm(`${selectedUser?.name}님에게 Tally 문자를 발송하시겠습니까?`)) {
      return;
    }

    setActionLoading(tallyMatchTarget.id);
    try {
      const res = await fetch('/api/inbox/tally-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inboxId: tallyMatchTarget.id,
          userId: selectedUserId,
        }),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        alert(result.message || '문자 발송이 완료되었습니다.');
        setTallyMatchOpen(false);
        router.refresh();
      } else {
        alert(result.error || '문자 발송에 실패했습니다.');
      }
    } catch (error) {
      console.error('Tally 매칭 오류:', error);
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // 수동 배정 다이얼로그 열기
  const openAssignDialog = async (item: InboxItem) => {
    setAssignTarget(item);
    setSelectedSlotId("");
    setAssignOpen(true);

    // 빈 슬롯 목록 조회
    try {
      const res = await fetch('/api/slots?available=true');
      const result = await res.json();
      if (result.success) {
        setAvailableSlots(result.data || []);
      }
    } catch (error) {
      console.error('슬롯 조회 오류:', error);
    }
  };

  // 수동 배정 실행
  const handleAssign = async () => {
    if (!assignTarget || !selectedSlotId) return;
    setActionLoading(assignTarget.id);

    try {
      const res = await fetch('/api/inbox/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxId: assignTarget.id, slotId: selectedSlotId }),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        alert(result.data?.message || '수동 배정이 완료되었습니다.');
        setAssignOpen(false);
        router.refresh();
      } else {
        alert(result.error || '수동 배정에 실패했습니다.');
      }
    } catch (error) {
      console.error('수동 배정 오류:', error);
      alert('수동 배정 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const { kpi, todayLessons, inboxItems, date, dayOfWeek } = data;

  // 날짜 포맷
  const formattedDate = new Date(date).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
          <p className="text-slate-500 mt-1">{formattedDate}</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={refreshData}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard
          title="빈 슬롯"
          value={kpi.emptySlots}
          icon={Calendar}
          color="blue"
        />
        <KPICard
          title="인박스"
          value={kpi.inboxCount}
          icon={Inbox}
          color="red"
          highlight={kpi.inboxCount > 0}
        />
        <KPICard
          title="수강중"
          value={kpi.activeStudents}
          icon={Users}
          color="green"
        />
        <KPICard
          title="종료예정"
          value={kpi.endingSoon}
          icon={Clock}
          color="yellow"
          suffix="D-7"
        />
        <KPICard
          title="시스템 오류"
          value={kpi.systemErrors}
          icon={AlertCircle}
          color="red"
          highlight={kpi.systemErrors > 0}
        />
      </div>

      {/* SMS 현황 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            오늘 SMS 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-slate-600">발송 성공</span>
              <span className="font-bold text-green-600">{kpi.smsTodaySent}건</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-slate-600">발송 실패</span>
              <span className={`font-bold ${kpi.smsTodayFailed > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                {kpi.smsTodayFailed}건
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-slate-600">경고</span>
              <span className={`font-bold ${kpi.smsTodayWarning > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                {kpi.smsTodayWarning}건
              </span>
            </div>
            {(kpi.smsTodayFailed > 0 || kpi.smsTodayWarning > 0) && (
              <Badge variant="destructive" className="ml-auto">
                확인 필요
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 오늘의 수업 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="w-5 h-5 text-violet-600" />
              오늘의 수업
              <Badge variant="secondary" className="ml-auto">
                {todayLessons.length}건
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayLessons.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                오늘 예정된 수업이 없습니다
              </p>
            ) : (
              <div className="space-y-3">
                {todayLessons.map((lesson, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-violet-600 font-medium">
                        <Clock className="w-4 h-4" />
                        {lesson.time}
                      </div>
                      <div>
                        <span className="font-medium">{lesson.coachName}</span>
                        <span className="text-slate-400 mx-2">-</span>
                        <span>{lesson.studentName}</span>
                      </div>
                    </div>
                    <span className="text-sm text-slate-500">
                      {formatPhoneDisplay(lesson.studentPhone)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 인박스 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Inbox className="w-5 h-5 text-red-600" />
              인박스
              {kpi.inboxCount > 0 && (
                <Badge variant="destructive" className="ml-auto">
                  미처리 {kpi.inboxCount}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inboxItems.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                처리할 항목이 없습니다
              </p>
            ) : (
              <div className="space-y-3">
                {inboxItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 border border-slate-200 rounded-lg space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge
                          variant={
                            item.error_type === 'REFUND_MATCH_FAILED'
                              ? 'destructive'
                              : item.error_type === 'SLOT_CONFLICT'
                              ? 'destructive'
                              : 'warning'
                          }
                          className="mb-1"
                        >
                          {item.error_type === 'REFUND_MATCH_FAILED'
                            ? '환불 매칭 실패'
                            : item.error_type === 'SLOT_CONFLICT'
                            ? '슬롯 충돌'
                            : '파싱 실패'}
                        </Badge>
                        <p className="text-sm text-slate-600">
                          {item.raw_text || '데이터 없음'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {item.error_message}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      {item.error_type === 'SLOT_CONFLICT' && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => openAssignDialog(item)}
                          disabled={actionLoading === item.id}
                        >
                          {actionLoading === item.id ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <MapPin className="w-4 h-4 mr-1" />
                          )}
                          수동 배정
                        </Button>
                      )}
                      {item.error_type === 'REFUND_MATCH_FAILED' && item.raw_webhook_id && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openRefundModal(item)}
                          disabled={actionLoading === item.id}
                        >
                          {actionLoading === item.id ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <XCircle className="w-4 h-4 mr-1" />
                          )}
                          환불 처리
                        </Button>
                      )}
                      {item.error_type === 'TALLY_MATCH_FAILED' && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => openTallyMatchModal(item)}
                          disabled={actionLoading === item.id}
                        >
                          {actionLoading === item.id ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Users className="w-4 h-4 mr-1" />
                          )}
                          수강생 매칭
                        </Button>
                      )}
                      {item.error_type === 'PARSE_FAILED' && item.raw_webhook_id && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleReprocess(item)}
                          disabled={actionLoading === item.id}
                        >
                          {actionLoading === item.id ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4 mr-1" />
                          )}
                          재처리
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInboxAction(item.id, 'resolved')}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        처리완료
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleInboxAction(item.id, 'ignored')}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        무시
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 수동 배정 다이얼로그 */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>수동 배정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-sm text-slate-600">
              <p className="font-medium">원본 데이터:</p>
              <p className="text-slate-500">{assignTarget?.raw_text}</p>
            </div>
            <div className="space-y-2">
              <Label>빈 슬롯 선택</Label>
              <Select value={selectedSlotId} onValueChange={setSelectedSlotId}>
                <SelectTrigger>
                  <SelectValue placeholder="슬롯을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {availableSlots.length === 0 ? (
                    <SelectItem value="none" disabled>빈 슬롯이 없습니다</SelectItem>
                  ) : (
                    availableSlots.map((slot) => (
                      <SelectItem key={slot.id} value={slot.id}>
                        {slot.coach?.name} / {slot.day_of_week} / {slot.start_time?.slice(0, 5)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>취소</Button>
            <Button 
              onClick={handleAssign} 
              disabled={!selectedSlotId || actionLoading === assignTarget?.id}
            >
              {actionLoading === assignTarget?.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              배정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 환불 세션 선택 다이얼로그 */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>환불할 세션 선택</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-sm text-slate-600">
              <p className="font-medium">원본 데이터:</p>
              <p className="text-slate-500">{refundTarget?.raw_text}</p>
            </div>
            <div className="space-y-2">
              <Label>세션 선택</Label>
              {refundSessions.length === 0 ? (
                <p className="text-sm text-slate-500">활성 세션이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {refundSessions.map((session) => (
                    <label
                      key={session.id}
                      className={`flex items-center p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${
                        selectedSessionId === session.id ? 'border-red-500 bg-red-50' : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="refundSession"
                        value={session.id}
                        checked={selectedSessionId === session.id}
                        onChange={(e) => setSelectedSessionId(e.target.value)}
                        className="mr-3"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          결제횟수: {session.extension_count + 1}번 | {session.coach?.name} | {session.day_of_week} {session.start_time?.slice(0, 5)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {session.start_date} ~ {session.end_date}
                        </p>
                      </div>
                      <Badge variant={session.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {session.status === 'ACTIVE' ? '진행중' : '대기'}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
            
            {/* 당일 수업 정산 포함 여부 (오늘이 수업일인 경우에만 표시) */}
            {refundTarget?.error_message?.includes('오늘이 수업일') && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTodayLesson}
                    onChange={(e) => setIncludeTodayLesson(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <p className="font-medium text-sm text-amber-800">당일 수업 정산에 포함</p>
                    <p className="text-xs text-amber-600">
                      {includeTodayLesson 
                        ? '오늘 수업이 코치 정산에 포함됩니다.' 
                        : '오늘 수업이 코치 정산에서 제외됩니다.'}
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>취소</Button>
            <Button 
              variant="destructive"
              onClick={handleRefund} 
              disabled={!selectedSessionId || actionLoading === refundTarget?.id}
            >
              {actionLoading === refundTarget?.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              환불 처리
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tally 수강생 매칭 다이얼로그 */}
      <Dialog open={tallyMatchOpen} onOpenChange={setTallyMatchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tally 수강생 매칭</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 원본 정보 */}
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm font-medium text-slate-700">원본 정보</p>
              <p className="text-sm text-slate-600">
                이름: {tallyMatchTarget?.metadata?.name || '-'}
              </p>
              <p className="text-sm text-slate-600">
                입력 번호: {tallyMatchTarget?.metadata?.phone || '-'}
              </p>
              <p className="text-sm text-slate-600">
                폼 타입: {tallyMatchTarget?.metadata?.formType === 'APPLICATION' ? '코칭신청서' : '사전진단'}
              </p>
            </div>

            {/* 수강생 검색 */}
            <div className="space-y-2">
              <Label>수강생 검색</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="이름으로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchUsers(searchQuery)}
                />
                <Button 
                  variant="outline" 
                  onClick={() => searchUsers(searchQuery)}
                  disabled={searchLoading}
                >
                  {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '검색'}
                </Button>
              </div>
            </div>

            {/* 검색 결과 */}
            <div className="space-y-2">
              <Label>검색 결과</Label>
              {searchResults.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">
                  {searchQuery ? '검색 결과가 없습니다.' : '이름을 입력하고 검색하세요.'}
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchResults.map((user) => (
                    <label
                      key={user.id}
                      className={`flex items-center p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${
                        selectedUserId === user.id ? 'border-violet-500 bg-violet-50' : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tallyUser"
                        value={user.id}
                        checked={selectedUserId === user.id}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="mr-3"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{user.name}</p>
                        <p className="text-xs text-slate-500">{user.phone}</p>
                        {user.activeSessions.length > 0 && (
                          <p className="text-xs text-violet-600">
                            {user.activeSessions.map(s => `${s.coachName}/${s.dayOfWeek} ${s.startTime}`).join(', ')}
                          </p>
                        )}
                      </div>
                      {user.activeSessions.length > 0 ? (
                        <Badge className="bg-green-100 text-green-700">활성</Badge>
                      ) : (
                        <Badge variant="secondary">세션없음</Badge>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTallyMatchOpen(false)}>취소</Button>
            <Button 
              onClick={handleTallyMatch} 
              disabled={!selectedUserId || actionLoading === tallyMatchTarget?.id || !searchResults.find(u => u.id === selectedUserId)?.activeSessions?.length}
            >
              {actionLoading === tallyMatchTarget?.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              문자 발송
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface KPICardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'yellow' | 'red';
  highlight?: boolean;
  suffix?: string;
}

function KPICard({ title, value, icon: Icon, color, highlight, suffix }: KPICardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    yellow: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };

  const valueColorClasses = {
    blue: 'text-blue-600',
    green: 'text-emerald-600',
    yellow: 'text-amber-600',
    red: 'text-red-600',
  };

  return (
    <Card className={highlight ? 'ring-2 ring-red-200' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${highlight ? valueColorClasses[color] : 'text-slate-900'}`}>
              {value}
              {suffix && <span className="text-sm font-normal text-slate-400 ml-1">{suffix}</span>}
            </p>
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
