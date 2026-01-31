'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  Clock,
  Zap,
  Hand,
  Save,
  Eye,
  ToggleLeft,
  ToggleRight,
  Settings,
  Users,
  UserCog,
  Shield,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { SmsLogsPanel } from '@/components/sms-logs/sms-logs-client';

interface SmsTemplate {
  id: string;
  event_type: string;
  recipient_type: 'STUDENT' | 'COACH' | 'ADMIN';
  name: string;
  content: string;
  is_active: boolean;
  trigger_type: 'EVENT' | 'SCHEDULE' | 'MANUAL';
  schedule_days_before: number | null;
  schedule_time: string | null;
}

interface SmsEnabledSettings {
  STUDENT: boolean;
  COACH: boolean;
  ADMIN: boolean;
}

interface SettingsClientProps {
  templates: SmsTemplate[];
}

// 이벤트 타입별 그룹핑
const EVENT_GROUPS = {
  '신규/연장': ['NEW_ENROLL', 'RENEWAL'],
  '취소/환불': ['CANCEL', 'REFUND', 'REFUND_MATCH_FAILED'],
  '연기/시간변경': ['POSTPONE', 'SLOT_TIME_CHANGE'],
  'Tally 설문': ['TALLY_APPLICATION', 'TALLY_DIAGNOSIS'],
  '리마인더': ['REMINDER_D1', 'REMINDER_D2', 'COACH_BRIEFING'],
  '기타': ['EXTENSION_RECOMMEND', 'SLOT_CONFLICT', 'SYSTEM_ERROR'],
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  NEW_ENROLL: '신규 등록',
  RENEWAL: '재결제 (연장)',
  CANCEL: '수강 취소',
  REFUND: '환불 처리',
  REFUND_MATCH_FAILED: '환불 매칭 실패',
  POSTPONE: '수강 연기',
  SLOT_TIME_CHANGE: '슬롯 시간 변경',
  TALLY_APPLICATION: '코칭신청서',
  TALLY_DIAGNOSIS: '사전진단',
  REMINDER_D1: '리마인더 D-1',
  REMINDER_D2: '리마인더 D-2',
  COACH_BRIEFING: '코치 브리핑 D-1',
  EXTENSION_RECOMMEND: '연장 권유',
  SLOT_CONFLICT: '슬롯 충돌',
  SYSTEM_ERROR: '시스템 오류',
};

const RECIPIENT_LABELS: Record<string, string> = {
  STUDENT: '수강생',
  COACH: '코치',
  ADMIN: '관리자',
};

const VARIABLES = [
  '{수강생명}', '{코치명}', '{요일}', '{시간}', '{이전시간}',
  '{시작일}', '{종료일}', '{연기날짜}', '{오픈톡링크}',
  '{취소사유}', '{원본데이터}', '{오류메시지}', '{회차}',
  '{수업목록}', '{총건수}',
];

export function SettingsClient({ templates: initialTemplates }: SettingsClientProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [editOpen, setEditOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<SmsTemplate | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editDaysBefore, setEditDaysBefore] = useState<number>(1);
  const [editTime, setEditTime] = useState('18:00');
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  
  // SMS ON/OFF 설정
  const [smsEnabled, setSmsEnabled] = useState<SmsEnabledSettings>({
    STUDENT: false,
    COACH: false,
    ADMIN: true,
  });
  const [smsLoading, setSmsLoading] = useState(true);
  const [smsSaving, setSmsSaving] = useState(false);

  // 테스트 발송
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('[RCCC] 테스트 문자입니다.');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // 테스트 발송 함수
  const handleTestSend = async () => {
    if (!testPhone.trim()) {
      setTestResult({ success: false, message: '전화번호를 입력하세요.' });
      return;
    }
    
    // 전화번호 유효성 검사 (숫자만, 10-11자리)
    const phoneClean = testPhone.replace(/[^0-9]/g, '');
    if (phoneClean.length < 10 || phoneClean.length > 11) {
      setTestResult({ success: false, message: '올바른 전화번호 형식이 아닙니다. (예: 01012345678)' });
      return;
    }
    
    setTestSending(true);
    setTestResult(null);
    
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneClean, message: testMessage }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setTestResult({ success: true, message: '발송 성공!' });
      } else {
        setTestResult({ success: false, message: data.error || '발송 실패' });
      }
    } catch (err) {
      setTestResult({ success: false, message: '네트워크 오류' });
    } finally {
      setTestSending(false);
    }
  };

  // SMS 설정 로드
  useEffect(() => {
    fetch('/api/settings/sms')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.settings) {
          setSmsEnabled(data.settings);
        }
      })
      .catch(console.error)
      .finally(() => setSmsLoading(false));
  }, []);

  // SMS 설정 토글
  const toggleSmsEnabled = async (key: keyof SmsEnabledSettings) => {
    const newSettings = { ...smsEnabled, [key]: !smsEnabled[key] };
    setSmsSaving(true);
    
    try {
      const res = await fetch('/api/settings/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      
      if (res.ok) {
        setSmsEnabled(newSettings);
      }
    } catch (err) {
      console.error('SMS 설정 저장 실패:', err);
    } finally {
      setSmsSaving(false);
    }
  };

  const openEdit = (template: SmsTemplate) => {
    setEditTemplate(template);
    setEditContent(template.content);
    setEditDaysBefore(template.schedule_days_before || 1);
    setEditTime(template.schedule_time?.slice(0, 5) || '18:00');
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editTemplate) return;
    setSaving(true);

    try {
      const body: Record<string, unknown> = { content: editContent };
      
      if (editTemplate.trigger_type === 'SCHEDULE') {
        body.schedule_days_before = editDaysBefore;
        body.schedule_time = editTime + ':00';
      }

      const res = await fetch(`/api/sms-templates/${editTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setTemplates(prev =>
          prev.map(t =>
            t.id === editTemplate.id
              ? { ...t, content: editContent, schedule_days_before: editDaysBefore, schedule_time: editTime + ':00' }
              : t
          )
        );
        setEditOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (template: SmsTemplate) => {
    const res = await fetch(`/api/sms-templates/${template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !template.is_active }),
    });

    if (res.ok) {
      setTemplates(prev =>
        prev.map(t =>
          t.id === template.id ? { ...t, is_active: !t.is_active } : t
        )
      );
    }
  };

  const getPreview = () => {
    return editContent
      .replace('{수강생명}', '홍길동')
      .replace('{코치명}', '김다혜')
      .replace('{요일}', '화')
      .replace('{시간}', '19:00')
      .replace('{이전시간}', '18:00')
      .replace('{시작일}', '2025-02-01')
      .replace('{종료일}', '2025-02-28')
      .replace('{연기날짜}', '2025-02-08')
      .replace('{오픈톡링크}', '▶ 카톡방: https://open.kakao.com/xxx')
      .replace('{취소사유}', '개인 사정')
      .replace('{원본데이터}', '박유진/금요일/15:00')
      .replace('{오류메시지}', 'DB 연결 실패')
      .replace('{회차}', '2');
  };

  // 그룹별로 템플릿 정리
  const groupedTemplates: Record<string, SmsTemplate[]> = {};
  for (const [groupName, eventTypes] of Object.entries(EVENT_GROUPS)) {
    groupedTemplates[groupName] = templates.filter(t =>
      eventTypes.includes(t.event_type)
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6" />
          문자 설정
        </h1>
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            템플릿 관리
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            발송 내역
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
      {/* SMS ON/OFF 설정 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            문자 발송 ON/OFF
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-4">
            대상별로 문자 발송을 켜거나 끌 수 있습니다. 테스트 중에는 관리자만 켜두세요.
          </p>
          <div className="grid grid-cols-3 gap-4">
            {/* 수강생 */}
            <button
              onClick={() => toggleSmsEnabled('STUDENT')}
              disabled={smsLoading || smsSaving}
              className={`p-4 rounded-lg border-2 transition-all ${
                smsEnabled.STUDENT 
                  ? 'border-green-500 bg-green-50' 
                  : 'border-slate-200 bg-slate-50'
              } ${(smsLoading || smsSaving) ? 'opacity-50' : 'hover:shadow-md'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <Users className="w-5 h-5 text-slate-600" />
                {smsEnabled.STUDENT ? (
                  <ToggleRight className="w-6 h-6 text-green-600" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="text-left">
                <div className="font-medium">수강생</div>
                <div className={`text-sm ${smsEnabled.STUDENT ? 'text-green-600' : 'text-slate-500'}`}>
                  {smsEnabled.STUDENT ? 'ON' : 'OFF'}
                </div>
              </div>
            </button>

            {/* 코치 */}
            <button
              onClick={() => toggleSmsEnabled('COACH')}
              disabled={smsLoading || smsSaving}
              className={`p-4 rounded-lg border-2 transition-all ${
                smsEnabled.COACH 
                  ? 'border-green-500 bg-green-50' 
                  : 'border-slate-200 bg-slate-50'
              } ${(smsLoading || smsSaving) ? 'opacity-50' : 'hover:shadow-md'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <UserCog className="w-5 h-5 text-slate-600" />
                {smsEnabled.COACH ? (
                  <ToggleRight className="w-6 h-6 text-green-600" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="text-left">
                <div className="font-medium">코치</div>
                <div className={`text-sm ${smsEnabled.COACH ? 'text-green-600' : 'text-slate-500'}`}>
                  {smsEnabled.COACH ? 'ON' : 'OFF'}
                </div>
              </div>
            </button>

            {/* 관리자 */}
            <button
              onClick={() => toggleSmsEnabled('ADMIN')}
              disabled={smsLoading || smsSaving}
              className={`p-4 rounded-lg border-2 transition-all ${
                smsEnabled.ADMIN 
                  ? 'border-green-500 bg-green-50' 
                  : 'border-slate-200 bg-slate-50'
              } ${(smsLoading || smsSaving) ? 'opacity-50' : 'hover:shadow-md'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <Shield className="w-5 h-5 text-slate-600" />
                {smsEnabled.ADMIN ? (
                  <ToggleRight className="w-6 h-6 text-green-600" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="text-left">
                <div className="font-medium">관리자</div>
                <div className={`text-sm ${smsEnabled.ADMIN ? 'text-green-600' : 'text-slate-500'}`}>
                  {smsEnabled.ADMIN ? 'ON' : 'OFF'}
                </div>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 테스트 발송 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="w-5 h-5" />
            테스트 발송
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-4">
            SMS 설정을 켜기 전에 내 번호로 먼저 테스트해보세요.
          </p>
          <div className="flex gap-3">
            <Input
              placeholder="전화번호 (01012345678)"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="w-40"
            />
            <Input
              placeholder="메시지 내용"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={handleTestSend} 
              disabled={testSending}
              className="w-24"
            >
              {testSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1" />
                  발송
                </>
              )}
            </Button>
          </div>
          {testResult && (
            <div className={`mt-3 flex items-center gap-2 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
              {testResult.success ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              {testResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 p-4 bg-slate-50 rounded-lg">
        <p className="text-sm text-slate-600">
          <strong>사용 가능한 변수:</strong>{' '}
          {VARIABLES.map((v, i) => (
            <code key={i} className="bg-white px-1 py-0.5 rounded text-xs mr-1">
              {v}
            </code>
          ))}
        </p>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {Object.entries(groupedTemplates).map(([groupName, groupTemplates]) => (
          <AccordionItem key={groupName} value={groupName} className="border rounded-lg">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span className="font-medium">{groupName}</span>
                <Badge variant="secondary" className="ml-2">
                  {groupTemplates.length}개
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-3">
                {groupTemplates.map(template => (
                  <Card key={template.id} className={!template.is_active ? 'opacity-50' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium">
                              {EVENT_TYPE_LABELS[template.event_type] || template.event_type}
                            </span>
                            <Badge variant="outline">
                              {RECIPIENT_LABELS[template.recipient_type]}
                            </Badge>
                            {template.trigger_type === 'SCHEDULE' && (
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                D-{template.schedule_days_before} {template.schedule_time?.slice(0, 5)}
                              </Badge>
                            )}
                            {template.trigger_type === 'EVENT' && (
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <Zap className="w-3 h-3" />
                                즉시
                              </Badge>
                            )}
                            {template.trigger_type === 'MANUAL' && (
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <Hand className="w-3 h-3" />
                                수동
                              </Badge>
                            )}
                          </div>
                          <pre className="text-sm text-slate-600 whitespace-pre-wrap font-sans line-clamp-3">
                            {template.content}
                          </pre>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleActive(template)}
                          >
                            {template.is_active ? (
                              <ToggleRight className="w-5 h-5 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-slate-400" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(template)}
                          >
                            수정
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
        </TabsContent>

        <TabsContent value="logs">
          <SmsLogsPanel />
        </TabsContent>
      </Tabs>

      {/* 수정 다이얼로그 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editTemplate?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {editTemplate?.trigger_type === 'SCHEDULE' && (
              <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                <span className="text-sm">발송 시점:</span>
                <span>수업</span>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={editDaysBefore}
                  onChange={e => setEditDaysBefore(Number(e.target.value))}
                  className="w-16"
                />
                <span>일 전,</span>
                <Input
                  type="time"
                  value={editTime}
                  onChange={e => setEditTime(e.target.value)}
                  className="w-32"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">문자 내용</label>
              <Textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
              <span>변수:</span>
              {VARIABLES.map((v, i) => (
                <button
                  key={i}
                  onClick={() => setEditContent(prev => prev + v)}
                  className="bg-slate-100 px-1.5 py-0.5 rounded hover:bg-slate-200"
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                <Eye className="w-4 h-4 mr-1" />
                미리보기
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditOpen(false)}>
                  취소
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4 mr-1" />
                  {saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 미리보기 다이얼로그 */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>미리보기</DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-slate-100 rounded-lg">
            <pre className="whitespace-pre-wrap text-sm font-sans">
              {getPreview()}
            </pre>
          </div>
          <p className="text-xs text-slate-500">
            * 실제 발송 시 변수가 실제 값으로 치환됩니다.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
