// components/settlement/settlement-client.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
  ChevronLeft, 
  ChevronRight, 
  Lock, 
  Unlock,
  Eye,
  Loader2,
  Calculator,
  Users,
  TrendingUp,
  Building,
  Download,
} from "lucide-react";
import { exportSettlement } from "@/lib/utils/excel-export";

interface Coach {
  id: string;
  name: string;
  grade: string;
}

interface Session {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  day_of_week: string;
  start_time: string;
  payment_amount?: number;
  user?: {
    id: string;
    name: string;
    phone: string;
  };
}

interface CoachSettlement {
  coach: Coach;
  sessions: Session[];
  sessionCount: number;
  coachingCount: number;
  feePerSession: number;
  totalFee: number;
}

interface Summary {
  totalCoachingCount: number;
  totalRevenue: number;
  totalCoachFee: number;
  companyProfit: number;
}

interface SettlementData {
  targetMonth: string;
  isLocked: boolean;
  lockData?: {
    locked_at: string;
    locked_by?: string;
  } | null;
  coachSettlements: CoachSettlement[];
  summary: Summary;
}

interface SettlementClientProps {
  initialData: SettlementData;
}

const gradeLabel: Record<string, string> = {
  TRAINEE: "견습",
  REGULAR: "정식",
  SENIOR: "선임",
};

export function SettlementClient({ initialData }: SettlementClientProps) {
  const router = useRouter();
  const [data, setData] = useState<SettlementData>(initialData);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<CoachSettlement | null>(null);
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);

  // 월 변경
  const changeMonth = async (direction: "prev" | "next") => {
    setLoading(true);
    const [year, month] = data.targetMonth.split("-").map(Number);
    let newYear = year;
    let newMonth = month + (direction === "next" ? 1 : -1);

    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }

    const newYearMonth = `${newYear}-${String(newMonth).padStart(2, "0")}`;
    
    try {
      const res = await fetch(`/api/settlement?month=${newYearMonth}`);
      const newData = await res.json();
      setData(newData);
    } catch {
      alert("데이터 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 정산 확정
  const handleLock = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settlement/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearMonth: data.targetMonth }),
      });
      if (res.ok) {
        router.refresh();
        setLockConfirmOpen(false);
        // 데이터 새로고침
        const newRes = await fetch(`/api/settlement?month=${data.targetMonth}`);
        const newData = await newRes.json();
        setData(newData);
      } else {
        const err = await res.json();
        alert(err.error || "정산 확정에 실패했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 확정 취소
  const handleUnlock = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settlement/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearMonth: data.targetMonth }),
      });
      if (res.ok) {
        router.refresh();
        setUnlockConfirmOpen(false);
        // 데이터 새로고침
        const newRes = await fetch(`/api/settlement?month=${data.targetMonth}`);
        const newData = await newRes.json();
        setData(newData);
      } else {
        const err = await res.json();
        alert(err.error || "확정 취소에 실패했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 상세 보기
  const openDetail = (coachSettlement: CoachSettlement) => {
    setSelectedCoach(coachSettlement);
    setDetailOpen(true);
  };

  // 엑셀 다운로드
  const handleExport = () => {
    const [year, month] = data.targetMonth.split("-").map(Number);
    const exportData = data.coachSettlements.map(cs => ({
      coachName: cs.coach.name,
      grade: cs.coach.grade,
      sessions: cs.coachingCount,
      pricePerSession: cs.feePerSession,
      total: cs.totalFee,
    }));
    exportSettlement(exportData, year, month);
  };

  // 월 표시 포맷
  const formatMonth = (yearMonth: string) => {
    const [year, month] = yearMonth.split("-");
    return `${year}년 ${parseInt(month)}월`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">정산 관리</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={loading}>
            <Download className="w-4 h-4 mr-2" />
            엑셀 다운로드
          </Button>
          {data.isLocked ? (
            <Button variant="outline" onClick={() => setUnlockConfirmOpen(true)} disabled={loading}>
              <Unlock className="w-4 h-4 mr-2" />
              확정 취소
            </Button>
          ) : (
            <Button onClick={() => setLockConfirmOpen(true)} disabled={loading}>
              <Lock className="w-4 h-4 mr-2" />
              정산 확정
            </Button>
          )}
        </div>
      </div>

      {/* 월 선택 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-6">
            <Button variant="ghost" size="icon" onClick={() => changeMonth("prev")} disabled={loading}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xl font-semibold">{formatMonth(data.targetMonth)}</span>
              {data.isLocked && (
                <Badge className="bg-green-100 text-green-700 border-green-300">
                  <Lock className="w-3 h-3 mr-1" />
                  확정됨
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => changeMonth("next")} disabled={loading}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 월 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">총 코칭 건수</p>
                <p className="text-2xl font-bold">{data.summary.totalCoachingCount}회</p>
              </div>
              <Calculator className="w-8 h-8 text-slate-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">총 매출</p>
                <p className="text-2xl font-bold text-blue-600">{data.summary.totalRevenue.toLocaleString()}원</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">코치 지급</p>
                <p className="text-2xl font-bold text-amber-600">{data.summary.totalCoachFee.toLocaleString()}원</p>
              </div>
              <Users className="w-8 h-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">회사 수익</p>
                <p className="text-2xl font-bold text-green-600">{data.summary.companyProfit.toLocaleString()}원</p>
              </div>
              <Building className="w-8 h-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 코치별 정산 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">코치별 정산</CardTitle>
        </CardHeader>
        <CardContent>
          {data.coachSettlements.length === 0 ? (
            <p className="text-slate-500 text-center py-8">해당 월에 정산 내역이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-slate-700">코치명</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-700">등급</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-700">1회 단가</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-700">세션 수</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-700">코칭 횟수</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-700">정산금</th>
                    <th className="text-center py-3 px-4 font-medium text-slate-700">상세</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coachSettlements.map((item) => (
                    <tr key={item.coach.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium">{item.coach.name}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{gradeLabel[item.coach.grade] || item.coach.grade}</Badge>
                      </td>
                      <td className="py-3 px-4 text-right">{item.feePerSession.toLocaleString()}원</td>
                      <td className="py-3 px-4 text-right">{item.sessionCount}개</td>
                      <td className="py-3 px-4 text-right">{item.coachingCount}회</td>
                      <td className="py-3 px-4 text-right font-semibold text-amber-600">
                        {item.totalFee.toLocaleString()}원
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(item)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={5} className="py-3 px-4 text-right">합계</td>
                    <td className="py-3 px-4 text-right text-amber-600">
                      {data.summary.totalCoachFee.toLocaleString()}원
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 코치 상세 모달 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCoach?.coach.name} 코치 상세 내역
            </DialogTitle>
          </DialogHeader>
          {selectedCoach && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm text-slate-500">등급</p>
                  <p className="font-medium">{gradeLabel[selectedCoach.coach.grade]}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">코칭 횟수</p>
                  <p className="font-medium">{selectedCoach.coachingCount}회</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">정산금</p>
                  <p className="font-medium text-amber-600">{selectedCoach.totalFee.toLocaleString()}원</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">세션 목록</h4>
                <div className="max-h-60 overflow-y-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3">수강생</th>
                        <th className="text-left py-2 px-3">요일/시간</th>
                        <th className="text-left py-2 px-3">기간</th>
                        <th className="text-right py-2 px-3">결제금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCoach.sessions.map((session) => (
                        <tr key={session.id} className="border-t">
                          <td className="py-2 px-3">{session.user?.name || "-"}</td>
                          <td className="py-2 px-3">{session.day_of_week} {session.start_time?.slice(0, 5)}</td>
                          <td className="py-2 px-3 text-slate-500 text-xs">
                            {session.start_date} ~ {session.end_date}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {session.payment_amount?.toLocaleString() || 0}원
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 정산 확정 확인 */}
      <AlertDialog open={lockConfirmOpen} onOpenChange={setLockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정산 확정</AlertDialogTitle>
            <AlertDialogDescription>
              {formatMonth(data.targetMonth)} 정산을 확정하시겠습니까?
              <br />
              확정 후에는 해당 월의 세션을 수정할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleLock} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              확정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 확정 취소 확인 */}
      <AlertDialog open={unlockConfirmOpen} onOpenChange={setUnlockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>확정 취소</AlertDialogTitle>
            <AlertDialogDescription>
              {formatMonth(data.targetMonth)} 정산 확정을 취소하시겠습니까?
              <br />
              취소 후에는 해당 월의 세션을 다시 수정할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlock} disabled={loading} className="bg-red-600 hover:bg-red-700">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              확정 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
