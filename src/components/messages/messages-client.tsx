// components/messages/messages-client.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Circle,
  Ban,
  RotateCcw,
  Loader2,
  MessageSquare,
  Download,
} from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";
import { exportMessageLogs } from "@/lib/utils/excel-export";

interface SystemLog {
  id: string;
  event_type: string;
  status: string;
  message: string;
  error_detail?: string | null;
  raw_data?: Record<string, unknown> | null;
  process_status: string;
  created_at: string;
}

interface MessagesClientProps {
  initialLogs: SystemLog[];
}

const eventTypeLabel: Record<string, string> = {
  WEBHOOK_RECEIVED: "웹훅 수신",
  WEBHOOK_FAILED: "웹훅 실패",
  WEBHOOK_DUPLICATE: "웹훅 중복",
  PARSE_SUCCESS: "파싱 성공",
  PARSE_FAILED: "파싱 실패",
  SMS_SENT: "문자 발송",
  SMS_FAILED: "문자 실패",
  SESSION_CREATED: "세션 생성",
  SESSION_CANCELLED: "세션 취소",
  SESSION_REFUNDED: "세션 환불",
  SLOT_CONFLICT: "슬롯 충돌",
  REFUND_AUTO_PROCESSED: "자동 환불",
  REFUND_MATCH_FAILED: "환불 매칭 실패",
  MANUAL_USER_CREATED: "수동 등록",
  WEBHOOK_REPROCESSED: "웹훅 재처리",
  CRON_STARTED: "크론 시작",
  CRON_COMPLETED: "크론 완료",
  SYSTEM_ERROR: "시스템 오류",
};

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case "SUCCESS":
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case "FAILED":
      return <XCircle className="w-5 h-5 text-red-500" />;
    case "WARNING":
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    default:
      return <Circle className="w-5 h-5 text-slate-400" />;
  }
};

const ProcessStatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case "SUCCESS":
      return <Badge variant="outline" className="text-green-600 border-green-300">✅ 처리완료</Badge>;
    case "PENDING":
      return <Badge variant="outline" className="text-slate-500 border-slate-300">⚪ 미처리</Badge>;
    case "RESOLVED":
      return <Badge variant="outline" className="text-blue-600 border-blue-300">✅ 해결됨</Badge>;
    case "IGNORED":
      return <Badge variant="outline" className="text-slate-400 border-slate-200">⛔ 무시됨</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export function MessagesClient({ initialLogs }: MessagesClientProps) {
  const router = useRouter();
  const [logs, setLogs] = useState<SystemLog[]>(initialLogs);
  const [dateFilter, setDateFilter] = useState("7days");
  const [statusFilter, setStatusFilter] = useState("all");
  const [errorOnly, setErrorOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Realtime 구독
  useEffect(() => {
    const supabase = getBrowserClient();
    
    const channel = supabase
      .channel('messages-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_logs' }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_logs' }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // initialLogs가 변경되면 state 업데이트
  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  // 날짜 필터 계산
  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (dateFilter) {
      case "today":
        return today;
      case "yesterday":
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
      case "7days":
        const week = new Date(today);
        week.setDate(week.getDate() - 7);
        return week;
      default:
        return null;
    }
  };

  // 필터링
  const filteredLogs = logs.filter((log) => {
    // 날짜 필터
    const dateRange = getDateRange();
    if (dateRange) {
      const logDate = new Date(log.created_at);
      if (dateFilter === "today" || dateFilter === "yesterday") {
        const logDateOnly = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate());
        if (logDateOnly.getTime() !== dateRange.getTime()) return false;
      } else {
        if (logDate < dateRange) return false;
      }
    }

    // 상태 필터
    if (statusFilter === "pending" && log.process_status !== "PENDING") return false;
    if (statusFilter === "resolved" && !["SUCCESS", "RESOLVED"].includes(log.process_status)) return false;

    // 오류만
    if (errorOnly && log.status !== "FAILED") return false;

    return true;
  });

  // 상태 변경
  const handleStatusChange = async (logId: string, newStatus: string) => {
    setActionLoading(logId);
    try {
      const res = await fetch(`/api/logs/${logId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        alert("상태 변경에 실패했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  // 문자 재시도
  const handleSmsRetry = async (logId: string) => {
    setActionLoading(logId);
    try {
      const res = await fetch(`/api/logs/${logId}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        alert("재시도 요청이 완료되었습니다.");
        router.refresh();
      } else {
        alert("재시도에 실패했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  // 웹훅 재처리
  const handleWebhookReprocess = async (logId: string) => {
    setActionLoading(logId);
    try {
      const res = await fetch(`/api/logs/${logId}/reprocess`, {
        method: "POST",
      });
      if (res.ok) {
        alert("재처리 요청이 완료되었습니다.");
        router.refresh();
      } else {
        alert("재처리에 실패했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  // 새로고침
  const handleRefresh = () => {
    setLoading(true);
    router.refresh();
    setTimeout(() => setLoading(false), 500);
  };

  // 엑셀 다운로드
  const handleExport = () => {
    const exportData = filteredLogs.map(log => ({
      createdAt: new Date(log.created_at).toLocaleString('ko-KR'),
      eventType: log.event_type,
      status: log.status,
      message: log.message,
    }));
    exportMessageLogs(exportData);
  };

  // 통계
  const stats = {
    total: filteredLogs.length,
    pending: filteredLogs.filter(l => l.process_status === "PENDING").length,
    errors: filteredLogs.filter(l => l.status === "FAILED").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">메시지 / 로그</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            엑셀 다운로드
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* 필터 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2">
              <Label>날짜</Label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">오늘</SelectItem>
                  <SelectItem value="yesterday">어제</SelectItem>
                  <SelectItem value="7days">최근 7일</SelectItem>
                  <SelectItem value="all">전체</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>처리상태</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="pending">미처리</SelectItem>
                  <SelectItem value="resolved">처리완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="errorOnly"
                checked={errorOnly}
                onChange={(e) => setErrorOnly(e.target.checked)}
                className="rounded border-slate-300"
              />
              <Label htmlFor="errorOnly" className="cursor-pointer">오류만 보기</Label>
            </div>
            <div className="flex-1" />
            <div className="flex gap-4 text-sm text-slate-500">
              <span>전체 <strong className="text-slate-900">{stats.total}</strong></span>
              <span>미처리 <strong className="text-amber-600">{stats.pending}</strong></span>
              <span>오류 <strong className="text-red-600">{stats.errors}</strong></span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 로그 목록 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            시스템 로그
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <p className="text-slate-500 text-center py-8">
              해당 조건의 로그가 없습니다.
            </p>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {filteredLogs.map((log) => (
                <AccordionItem
                  key={log.id}
                  value={log.id}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-4 w-full">
                      <StatusIcon status={log.status} />
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {eventTypeLabel[log.event_type] || log.event_type}
                          </Badge>
                          <span className="text-sm text-slate-500">
                            {new Date(log.created_at).toLocaleString("ko-KR")}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1 truncate max-w-md">
                          {log.message}
                        </p>
                      </div>
                      <ProcessStatusBadge status={log.process_status} />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-4 pb-2 space-y-4">
                      {/* 기본 정보 */}
                      <div>
                        <h4 className="font-medium text-sm text-slate-700 mb-2">기본 정보</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 p-3 rounded">
                          <div><span className="text-slate-500">이벤트:</span> {eventTypeLabel[log.event_type] || log.event_type}</div>
                          <div><span className="text-slate-500">상태:</span> {log.status}</div>
                          <div className="col-span-2"><span className="text-slate-500">메시지:</span> {log.message}</div>
                          <div><span className="text-slate-500">시간:</span> {new Date(log.created_at).toLocaleString("ko-KR")}</div>
                          <div><span className="text-slate-500">처리상태:</span> {log.process_status}</div>
                        </div>
                      </div>

                      {/* 에러 상세 */}
                      {log.error_detail && (
                        <div>
                          <h4 className="font-medium text-sm text-red-700 mb-2">에러 상세</h4>
                          <pre className="text-xs bg-red-50 text-red-800 p-3 rounded overflow-x-auto">
                            {log.error_detail}
                          </pre>
                        </div>
                      )}

                      {/* 원본 데이터 */}
                      {log.raw_data && (
                        <div>
                          <h4 className="font-medium text-sm text-slate-700 mb-2">원본 데이터</h4>
                          <pre className="text-xs bg-slate-100 p-3 rounded overflow-x-auto max-h-40">
                            {JSON.stringify(log.raw_data, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* 액션 버튼 */}
                      <div className="flex gap-2 pt-2 border-t">
                        {log.event_type.includes("SMS") && log.status === "FAILED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSmsRetry(log.id)}
                            disabled={actionLoading === log.id}
                          >
                            {actionLoading === log.id ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4 mr-1" />
                            )}
                            재시도
                          </Button>
                        )}
                        {log.event_type.includes("WEBHOOK") && log.status === "FAILED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleWebhookReprocess(log.id)}
                            disabled={actionLoading === log.id}
                          >
                            {actionLoading === log.id ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-1" />
                            )}
                            재처리
                          </Button>
                        )}
                        {log.process_status === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(log.id, "RESOLVED")}
                              disabled={actionLoading === log.id}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              처리완료
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(log.id, "IGNORED")}
                              disabled={actionLoading === log.id}
                            >
                              <Ban className="w-4 h-4 mr-1" />
                              무시
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
