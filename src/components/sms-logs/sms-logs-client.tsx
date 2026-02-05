'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  RefreshCw,
  MessageSquare,
  Filter,
  X
} from 'lucide-react';

interface SmsLog {
  id: string;
  recipient_phone: string;
  recipient_type: 'STUDENT' | 'COACH' | 'ADMIN';
  message_content: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
  error_message: string | null;
  provider_message_id: string | null;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  SENT: 'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기중',
  SENT: '발송완료',
  DELIVERED: '수신확인',
  FAILED: '실패',
};

const RECIPIENT_LABELS: Record<string, string> = {
  STUDENT: '수강생',
  COACH: '코치',
  ADMIN: '관리자',
};

const RECIPIENT_COLORS: Record<string, string> = {
  STUDENT: 'bg-purple-100 text-purple-800',
  COACH: 'bg-indigo-100 text-indigo-800',
  ADMIN: 'bg-gray-100 text-gray-800',
};

// 독립 페이지용
export function SmsLogsClient() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SmsLogsPanel />
    </div>
  );
}

// 설정 페이지 탭 내 사용
export function SmsLogsPanel() {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<SmsLog | null>(null);

  // 필터
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('ALL');
  const [recipientType, setRecipientType] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        t: String(Date.now()),  // 캐시 방지용 타임스탬프
      });
      if (status && status !== 'ALL') params.set('status', status);
      if (recipientType && recipientType !== 'ALL') params.set('recipientType', recipientType);
      if (search) params.set('search', search);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/sms-logs?${params}`);
      const data = await res.json();
      
      setLogs(data.logs || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
    } catch (error) {
      console.error('SMS 로그 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [status, recipientType, startDate, endDate]);

  const handleSearch = () => {
    fetchLogs(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setRecipientType('');
    setStartDate('');
    setEndDate('');
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 11) {
      return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
    }
    return phone;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateMessage = (msg: string, maxLength = 30) => {
    if (msg.length <= maxLength) return msg;
    return msg.slice(0, maxLength) + '...';
  };

  // 통계
  const stats = {
    total: pagination.total,
    sent: logs.filter(l => l.status === 'SENT' || l.status === 'DELIVERED').length,
    failed: logs.filter(l => l.status === 'FAILED').length,
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-gray-500 text-sm">
          총 {pagination.total.toLocaleString()}건의 발송 기록
        </p>
        <Button onClick={() => fetchLogs(pagination.page)} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>

      {/* 필터 */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            {/* 검색 */}
            <div className="flex gap-2 flex-1 min-w-[200px]">
              <Input
                placeholder="전화번호 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="max-w-[200px]"
              />
              <Button onClick={handleSearch} size="sm">
                <Search className="w-4 h-4" />
              </Button>
            </div>

            {/* 상태 필터 */}
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체</SelectItem>
                <SelectItem value="SENT">발송완료</SelectItem>
                <SelectItem value="DELIVERED">수신확인</SelectItem>
                <SelectItem value="FAILED">실패</SelectItem>
                <SelectItem value="PENDING">대기중</SelectItem>
              </SelectContent>
            </Select>

            {/* 수신자 타입 */}
            <Select value={recipientType} onValueChange={setRecipientType}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="수신자" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체</SelectItem>
                <SelectItem value="STUDENT">수강생</SelectItem>
                <SelectItem value="COACH">코치</SelectItem>
                <SelectItem value="ADMIN">관리자</SelectItem>
              </SelectContent>
            </Select>

            {/* 날짜 필터 */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              날짜
            </Button>

            {/* 필터 초기화 */}
            {(search || status || recipientType || startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1" />
                초기화
              </Button>
            )}
          </div>

          {/* 날짜 필터 (토글) */}
          {showFilters && (
            <div className="flex gap-3 mt-3 pt-3 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">시작:</span>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">종료:</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <MessageSquare className="w-12 h-12 mb-3 text-gray-300" />
              <p>발송 내역이 없습니다</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">일시</TableHead>
                  <TableHead className="w-[100px]">수신자</TableHead>
                  <TableHead className="w-[130px]">전화번호</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead className="w-[90px]">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow 
                    key={log.id} 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelectedLog(log)}
                  >
                    <TableCell className="text-sm text-gray-600">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge className={RECIPIENT_COLORS[log.recipient_type]}>
                        {RECIPIENT_LABELS[log.recipient_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatPhone(log.recipient_phone)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">
                      <div className="whitespace-pre-wrap break-words">
                        {log.message_content}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[log.status]}>
                        {STATUS_LABELS[log.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* 페이지네이션 */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-gray-500">
                {pagination.total}건 중 {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)}건
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="flex items-center px-3 text-sm">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 상세 모달 */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>SMS 상세</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge className={RECIPIENT_COLORS[selectedLog.recipient_type]}>
                  {RECIPIENT_LABELS[selectedLog.recipient_type]}
                </Badge>
                <Badge className={STATUS_COLORS[selectedLog.status]}>
                  {STATUS_LABELS[selectedLog.status]}
                </Badge>
              </div>
              
              <div>
                <p className="text-sm text-gray-500 mb-1">수신번호</p>
                <p className="font-mono">{formatPhone(selectedLog.recipient_phone)}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-1">발송일시</p>
                <p>{new Date(selectedLog.created_at).toLocaleString('ko-KR')}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-1">내용</p>
                <div className="p-3 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap">
                  {selectedLog.message_content}
                </div>
              </div>

              {selectedLog.error_message && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">오류 메시지</p>
                  <p className="text-red-600 text-sm">{selectedLog.error_message}</p>
                </div>
              )}

              {selectedLog.provider_message_id && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">메시지 ID</p>
                  <p className="font-mono text-xs text-gray-600">{selectedLog.provider_message_id}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
