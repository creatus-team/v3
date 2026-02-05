// components/students/students-client.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Search, 
  Plus, 
  User,
  Calendar,
  Clock,
  Loader2,
  Download,
} from "lucide-react";
import { formatPhoneDisplay } from "@/lib/utils/phone-normalizer";
import { exportStudents } from "@/lib/utils/excel-export";

interface SessionCoach {
  id: string;
  name: string;
  grade: string;
}

interface SessionSlot {
  id: string;
  day_of_week: string;
  start_time: string;
}

interface StudentSession {
  id: string;
  user_id: string;
  coach_id: string;
  slot_id?: string | null;
  day_of_week: string;
  start_time: string;
  start_date: string;
  end_date: string;
  extension_count: number;
  status: string;
  payment_amount?: number;
  payment_date?: string;
  product_name?: string;
  coach?: SessionCoach;
  slot?: SessionSlot;
  postponements?: Array<{ postponed_date: string; reason?: string; created_at: string }>;
}

interface ActivityLog {
  id: string;
  action_type: string;
  reason?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface ExtendedUser {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  memo?: string | null;
  is_manual_entry: boolean;
  created_at: string;
  displayStatus: string;
  currentSession?: StudentSession;
  sessions: StudentSession[];
  dDay: number | null;
  extensionCount: number;
  completedLessons: number;
  activity_logs?: ActivityLog[];
}

interface Coach {
  id: string;
  name: string;
  grade: string;
}

interface Slot {
  id: string;
  coach_id: string;
  day_of_week: string;
  start_time: string;
}

interface StudentsClientProps {
  initialStudents: ExtendedUser[];
}

const statusBadge = (status: string) => {
  const badges: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "warning" }> = {
    active: { label: "수강중", variant: "default" },
    pending: { label: "대기", variant: "secondary" },
    expired: { label: "종료", variant: "outline" },
    refunded: { label: "환불", variant: "destructive" },
    cancelled: { label: "취소", variant: "destructive" },
    early_terminated: { label: "조기종료", variant: "warning" },
  };
  const badge = badges[status] || { label: status, variant: "outline" as const };
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
};

const actionTypeLabel: Record<string, string> = {
  ENROLL: "신규 등록",
  RENEWAL: "재결제",
  CANCEL: "취소",
  REFUND: "환불",
  POSTPONE: "연기",
  EARLY_TERMINATE: "조기종료",
  EDIT: "정보 수정",
  SLOT_TIME_CHANGE: "시간 변경",
  USER_MERGE: "병합",
};

export function StudentsClient({ initialStudents }: StudentsClientProps) {
  const router = useRouter();
  const [students] = useState<ExtendedUser[]>(initialStudents);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("endingSoon");
  const [loading, setLoading] = useState(false);

  // 수강 연기 다이얼로그
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [postponeTarget, setPostponeTarget] = useState<ExtendedUser | null>(null);
  const [postponeWeeks, setPostponeWeeks] = useState("1");
  const [postponeReason, setPostponeReason] = useState("");

  // 수강 취소 다이얼로그
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ExtendedUser | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // 수강생 추가 다이얼로그
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    phone: "",
    email: "",
    memo: "",
    coachId: "",
    slotId: "",
    manualReason: "CASH_PAYMENT",
  });
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  // 정보 수정 다이얼로그
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExtendedUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", memo: "" });

  // 수강생 병합 다이얼로그
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState<ExtendedUser | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSearch, setMergeSearch] = useState("");

  // 필터링 및 정렬
  const filteredStudents = students
    .filter((student) => {
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          student.name.toLowerCase().includes(searchLower) ||
          student.phone.includes(search)
        );
      }
      return true;
    })
    .filter((student) => {
      switch (statusFilter) {
        case "active":
          return student.displayStatus === "active";
        case "pending":
          return student.displayStatus === "pending";
        case "endingSoon":
          return student.displayStatus === "active" && student.dDay !== null && student.dDay <= 7 && student.dDay > 0;
        case "expired":
          return student.displayStatus === "expired";
        case "refundedCancelled":
          return ["refunded", "cancelled", "early_terminated"].includes(student.displayStatus);
        default:
          return true;
      }
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "endingSoon":
          if (a.dDay === null && b.dDay === null) return 0;
          if (a.dDay === null) return 1;
          if (b.dDay === null) return -1;
          return a.dDay - b.dDay;
        case "createdAt":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "name":
          return a.name.localeCompare(b.name);
        case "coach":
          const coachA = a.currentSession?.coach?.name || "zzz";
          const coachB = b.currentSession?.coach?.name || "zzz";
          return coachA.localeCompare(coachB);
        default:
          return 0;
      }
    });

  // 수강 연기 처리
  const handlePostpone = async () => {
    if (!postponeTarget?.currentSession) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${postponeTarget.currentSession.id}/postpone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeks: parseInt(postponeWeeks), reason: postponeReason }),
      });
      if (res.ok) {
        router.refresh();
        setPostponeOpen(false);
        setPostponeReason("");
      } else {
        const data = await res.json();
        alert(data.error || "연기 처리에 실패했습니다.");
      }
    } catch {
      alert("연기 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 수강 취소 처리
  const handleCancel = async () => {
    if (!cancelTarget?.currentSession || !cancelReason) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${cancelTarget.currentSession.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (res.ok) {
        router.refresh();
        setCancelOpen(false);
        setCancelReason("");
      } else {
        const data = await res.json();
        alert(data.error || "취소 처리에 실패했습니다.");
      }
    } catch {
      alert("취소 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 수강생 추가 다이얼로그 열기
  const openAddDialog = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/coaches");
      const data = await res.json();
      if (data.coaches) {
        setCoaches(data.coaches);
      }
    } catch {
      console.error("코치 목록 조회 실패");
    } finally {
      setLoading(false);
      setAddOpen(true);
    }
  };

  // 코치 선택 시 슬롯 조회
  const handleCoachSelect = async (coachId: string) => {
    setAddForm({ ...addForm, coachId, slotId: "" });
    if (!coachId) {
      setSlots([]);
      return;
    }
    try {
      const res = await fetch(`/api/slots?coachId=${coachId}&available=true`);
      const data = await res.json();
      if (data.slots) {
        setSlots(data.slots);
      }
    } catch {
      console.error("슬롯 목록 조회 실패");
    }
  };

  // 수강생 추가 처리
  const handleAddStudent = async () => {
    if (!addForm.name || !addForm.phone || !addForm.coachId || !addForm.slotId) {
      alert("필수 항목을 모두 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name,
          phone: addForm.phone,
          email: addForm.email || null,
          memo: addForm.memo || null,
          slotId: addForm.slotId,
          manualReason: addForm.manualReason,
        }),
      });
      if (res.ok) {
        router.refresh();
        setAddOpen(false);
        setAddForm({ name: "", phone: "", email: "", memo: "", coachId: "", slotId: "", manualReason: "CASH_PAYMENT" });
      } else {
        const data = await res.json();
        alert(data.error || "수강생 추가에 실패했습니다.");
      }
    } catch {
      alert("수강생 추가 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 정보 수정 다이얼로그 열기
  const openEditDialog = (student: ExtendedUser) => {
    setEditTarget(student);
    setEditForm({
      name: student.name,
      phone: student.phone,
      email: student.email || "",
      memo: student.memo || "",
    });
    setEditOpen(true);
  };

  // 정보 수정 처리
  const handleEdit = async () => {
    if (!editTarget) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        router.refresh();
        setEditOpen(false);
      } else {
        const data = await res.json();
        alert(data.error || "정보 수정에 실패했습니다.");
      }
    } catch {
      alert("정보 수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 병합 다이얼로그 열기
  const openMergeDialog = (student: ExtendedUser) => {
    setMergeSource(student);
    setMergeTargetId("");
    setMergeSearch("");
    setMergeOpen(true);
  };

  // 수강생 병합
  const handleMerge = async () => {
    if (!mergeSource || !mergeTargetId) return;
    setLoading(true);

    try {
      const res = await fetch("/api/users/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keepUserId: mergeTargetId,
          mergeUserId: mergeSource.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "병합이 완료되었습니다.");
        router.refresh();
        setMergeOpen(false);
      } else {
        alert(data.error || "병합에 실패했습니다.");
      }
    } catch {
      alert("병합 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 병합 대상 필터링
  const mergeTargets = students.filter(s => 
    s.id !== mergeSource?.id && 
    (mergeSearch === "" || 
     s.name.toLowerCase().includes(mergeSearch.toLowerCase()) ||
     s.phone.includes(mergeSearch))
  );

  // D-Day 표시 포맷
  const formatDDay = (dDay: number | null) => {
    if (dDay === null) return null;
    if (dDay < 0) return `D+${Math.abs(dDay)}`;
    if (dDay === 0) return "D-Day";
    return `D-${dDay}`;
  };

  // 엑셀 다운로드
  const handleExport = () => {
    const exportData = filteredStudents.map(student => {
      const activeSession = student.sessions?.find(
        (s: { status: string }) => s.status === "ACTIVE" || s.status === "PENDING"
      );
      return {
        name: student.name,
        phone: student.phone,
        email: student.email || undefined,
        coachName: activeSession?.coach?.name,
        dayOfWeek: activeSession?.day_of_week,
        startTime: activeSession?.start_time,
        status: activeSession?.status || "EXPIRED",
        startDate: activeSession?.start_date,
        endDate: activeSession?.end_date,
      };
    });
    exportStudents(exportData);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">수강생 관리</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            엑셀 다운로드
          </Button>
          <Button onClick={openAddDialog}>
            <Plus className="w-4 h-4 mr-2" />
            수강생 추가
          </Button>
        </div>
      </div>

      {/* 필터 및 검색 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="이름 또는 전화번호로 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="상태 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="active">수강중</SelectItem>
                <SelectItem value="pending">대기</SelectItem>
                <SelectItem value="endingSoon">종료예정</SelectItem>
                <SelectItem value="expired">종료</SelectItem>
                <SelectItem value="refundedCancelled">환불/취소</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="정렬" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="endingSoon">종료임박순</SelectItem>
                <SelectItem value="createdAt">등록일순</SelectItem>
                <SelectItem value="name">이름순</SelectItem>
                <SelectItem value="coach">코치별</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 수강생 목록 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            수강생 목록
            <Badge variant="secondary" className="ml-2">
              {filteredStudents.length}명
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredStudents.length === 0 ? (
            <p className="text-slate-500 text-center py-8">
              {search || statusFilter !== "all"
                ? "검색 결과가 없습니다"
                : "등록된 수강생이 없습니다"}
            </p>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {filteredStudents.map((student) => (
                <AccordionItem
                  key={student.id}
                  value={student.id}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-4 w-full">
                      <User className="w-8 h-8 text-slate-400" />
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{student.name}</span>
                          <span className="text-sm text-slate-500">
                            {formatPhoneDisplay(student.phone)}
                          </span>
                          {student.is_manual_entry && (
                            <Badge variant="outline" className="text-xs">
                              수동등록
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-slate-500">
                          {student.currentSession ? (
                            <>
                              {student.currentSession.coach?.name} /{" "}
                              {student.currentSession.day_of_week} /{" "}
                              {student.currentSession.start_time?.slice(0, 5)}
                            </>
                          ) : (
                            "세션 없음"
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {statusBadge(student.displayStatus)}
                        {student.dDay !== null && (
                          <span
                            className={`text-sm font-medium ${
                              student.dDay <= 7 && student.dDay > 0
                                ? "text-amber-600"
                                : student.dDay <= 0
                                ? "text-red-600"
                                : "text-slate-500"
                            }`}
                          >
                            {formatDDay(student.dDay)}
                          </span>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-4 pb-2 space-y-4">
                      {/* 기본 정보 */}
                      <div>
                        <h4 className="font-medium text-sm text-slate-700 mb-2">기본 정보</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-slate-500">이름:</span> {student.name}</div>
                          <div><span className="text-slate-500">전화번호:</span> {formatPhoneDisplay(student.phone)}</div>
                          {student.email && <div><span className="text-slate-500">이메일:</span> {student.email}</div>}
                          {student.memo && <div className="col-span-2"><span className="text-slate-500">메모:</span> {student.memo}</div>}
                        </div>
                      </div>

                      {/* 현재 수강 */}
                      {student.currentSession && (
                        <div>
                          <h4 className="font-medium text-sm text-slate-700 mb-2">현재 수강</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-slate-500">코치:</span> {student.currentSession.coach?.name}</div>
                            <div><span className="text-slate-500">시간:</span> {student.currentSession.day_of_week}요일 {student.currentSession.start_time?.slice(0, 5)}</div>
                            <div><span className="text-slate-500">시작일:</span> {student.currentSession.start_date}</div>
                            <div>
                              <span className="text-slate-500">종료일:</span> {(() => {
                                const end = new Date(student.currentSession.end_date);
                                end.setDate(end.getDate() - 6);
                                return end.toISOString().split('T')[0];
                              })()}
                              {/* 다음 세션(재결제 완료)이 있으면 표시 */}
                              {(() => {
                                const nextSession = student.sessions.find(
                                  s => s.id !== student.currentSession?.id && 
                                  (s.status === 'PENDING' || s.status === 'ACTIVE') &&
                                  new Date(s.start_date) > new Date(student.currentSession!.start_date)
                                );
                                if (!nextSession) return null;
                                const nextEnd = new Date(nextSession.end_date);
                                nextEnd.setDate(nextEnd.getDate() - 6);
                                return (
                                  <span className="ml-2 text-green-600 text-xs">(재결제 완료: {nextEnd.toISOString().split('T')[0]}까지)</span>
                                );
                              })()}
                            </div>
                            <div><span className="text-slate-500">수업완료:</span> {student.completedLessons}/4 (결제횟수: {student.extensionCount}번)</div>
                            {student.currentSession.payment_amount && (
                              <div><span className="text-slate-500">결제:</span> {student.currentSession.payment_amount.toLocaleString()}원</div>
                            )}
                          </div>
                          {/* 연기 기록 */}
                          {student.currentSession.postponements && student.currentSession.postponements.length > 0 && (
                            <div className="mt-2 p-2 bg-amber-50 rounded text-sm">
                              <span className="text-amber-700 font-medium">연기 기록:</span>
                              {student.currentSession.postponements.map((p, i) => (
                                <span key={i} className="ml-2 text-amber-600">{p.postponed_date} {p.reason && `(${p.reason})`}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 히스토리 */}
                      {student.activity_logs && student.activity_logs.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm text-slate-700 mb-2">히스토리</h4>
                          <div className="space-y-1 text-sm max-h-32 overflow-y-auto">
                            {student.activity_logs.slice(0, 10).map((log) => {
                              // ENROLL/RENEWAL은 결제일 표시, 나머지는 처리일
                              const displayDate = (log.action_type === 'ENROLL' || log.action_type === 'RENEWAL')
                                && log.metadata && (log.metadata as Record<string, unknown>).paymentDate
                                ? new Date((log.metadata as Record<string, unknown>).paymentDate as string).toLocaleDateString("ko-KR")
                                : new Date(log.created_at).toLocaleDateString("ko-KR");
                              return (
                              <div key={log.id} className="flex items-center gap-2 text-slate-600">
                                <Clock className="w-3 h-3" />
                                <span>{displayDate}</span>
                                <span className="font-medium">{actionTypeLabel[log.action_type] || log.action_type}</span>
                                {log.reason && <span className="text-slate-400">- {log.reason}</span>}
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 액션 버튼 */}
                      <div className="flex gap-2 pt-2 border-t">
                        {(student.displayStatus === "active" || student.displayStatus === "pending") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setPostponeTarget(student);
                              setPostponeOpen(true);
                            }}
                          >
                            <Calendar className="w-4 h-4 mr-1" />
                            수강 연기
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(student)}>
                          정보 수정
                        </Button>
                        {(student.displayStatus === "active" || student.displayStatus === "pending") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              setCancelTarget(student);
                              setCancelOpen(true);
                            }}
                          >
                            수강 취소
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openMergeDialog(student)}
                        >
                          병합
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* 수강 연기 다이얼로그 */}
      <Dialog open={postponeOpen} onOpenChange={setPostponeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>수강 연기</DialogTitle>
            <DialogDescription>
              {postponeTarget?.name}님의 수강을 연기합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>연기 기간</Label>
              <Select value={postponeWeeks} onValueChange={setPostponeWeeks}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1주</SelectItem>
                  <SelectItem value="2">2주</SelectItem>
                  <SelectItem value="3">3주</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>연기 사유 (선택)</Label>
              <Textarea
                placeholder="연기 사유를 입력하세요..."
                value={postponeReason}
                onChange={(e) => setPostponeReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostponeOpen(false)}>취소</Button>
            <Button onClick={handlePostpone} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              연기 확정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수강 취소 확인 다이얼로그 */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수강 취소</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.name}님의 수강을 취소하시겠습니까?
              <br />이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>취소 사유 (필수)</Label>
            <Textarea
              placeholder="취소 사유를 입력하세요..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={!cancelReason || loading}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              취소 확정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 수강생 추가 다이얼로그 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>수강생 추가</DialogTitle>
            <DialogDescription>
              수동으로 수강생을 등록합니다. (시트 거치지 않음)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>이름 *</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="홍길동"
              />
            </div>
            <div className="space-y-2">
              <Label>전화번호 *</Label>
              <Input
                value={addForm.phone}
                onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                placeholder="01012345678"
              />
            </div>
            <div className="space-y-2">
              <Label>이메일</Label>
              <Input
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                placeholder="example@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label>코치 선택 *</Label>
              <Select value={addForm.coachId} onValueChange={handleCoachSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="코치를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {coaches.map((coach) => (
                    <SelectItem key={coach.id} value={coach.id}>
                      {coach.name} ({coach.grade === "TRAINEE" ? "견습" : coach.grade === "SENIOR" ? "선임" : "정식"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {addForm.coachId && (
              <div className="space-y-2">
                <Label>슬롯 선택 *</Label>
                <Select value={addForm.slotId} onValueChange={(v) => setAddForm({ ...addForm, slotId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="슬롯을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {slots.length === 0 ? (
                      <SelectItem value="" disabled>빈 슬롯이 없습니다</SelectItem>
                    ) : (
                      slots.map((slot) => (
                        <SelectItem key={slot.id} value={slot.id}>
                          {slot.day_of_week}요일 {slot.start_time.slice(0, 5)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>등록 사유 *</Label>
              <Select value={addForm.manualReason} onValueChange={(v) => setAddForm({ ...addForm, manualReason: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH_PAYMENT">현금/계좌이체</SelectItem>
                  <SelectItem value="FREE_TRIAL">무료 체험</SelectItem>
                  <SelectItem value="TEST">테스트</SelectItem>
                  <SelectItem value="SYSTEM_RECOVERY">시스템 오류 복구</SelectItem>
                  <SelectItem value="OTHER">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>메모</Label>
              <Textarea
                value={addForm.memo}
                onChange={(e) => setAddForm({ ...addForm, memo: e.target.value })}
                placeholder="특이사항 입력..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>취소</Button>
            <Button onClick={handleAddStudent} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 정보 수정 다이얼로그 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>정보 수정</DialogTitle>
            <DialogDescription>
              {editTarget?.name}님의 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>이름</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>전화번호</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>이메일</Label>
              <Input
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>메모</Label>
              <Textarea
                value={editForm.memo}
                onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>취소</Button>
            <Button onClick={handleEdit} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수강생 병합 다이얼로그 */}
      <AlertDialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>수강생 병합</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{mergeSource?.name}</strong>({formatPhoneDisplay(mergeSource?.phone || '')})을(를) 
              다른 수강생에게 병합합니다. 병합 후 이 수강생은 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>병합할 대상 검색</Label>
              <Input
                placeholder="이름 또는 전화번호"
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
              />
            </div>
            
            <div className="max-h-48 overflow-y-auto space-y-2 border rounded p-2">
              {mergeTargets.slice(0, 10).map(target => (
                <label 
                  key={target.id} 
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-50 ${
                    mergeTargetId === target.id ? 'bg-violet-50 border-violet-200 border' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="mergeTarget"
                    value={target.id}
                    checked={mergeTargetId === target.id}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="text-violet-600"
                  />
                  <div>
                    <p className="font-medium">{target.name}</p>
                    <p className="text-sm text-slate-500">{formatPhoneDisplay(target.phone)}</p>
                  </div>
                  <Badge variant="outline" className="ml-auto">
                    세션 {target.sessions?.length || 0}개
                  </Badge>
                </label>
              ))}
              {mergeTargets.length === 0 && (
                <p className="text-center text-slate-500 py-4">검색 결과가 없습니다</p>
              )}
            </div>

            {mergeTargetId && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                <p className="font-medium text-amber-800">⚠️ 주의</p>
                <p className="text-amber-700">
                  {mergeSource?.name}의 모든 세션과 기록이 선택한 수강생으로 이동됩니다.
                  이 작업은 되돌릴 수 없습니다.
                </p>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleMerge} 
              disabled={!mergeTargetId || loading}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              병합
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
