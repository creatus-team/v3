// app/api/cron/reminder/route.ts
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import dayjs from '@/lib/dayjs';
import { SESSION_STATUS, EVENT_TYPE, LOG_PROCESS_STATUS, DAYS_ARRAY, REMINDER_STATUS } from '@/lib/constants';
import { sendSms } from '@/lib/sms';
import { replaceVariables } from '@/lib/sms/template-sender';
import { getSmsSettings } from '@/lib/utils/sms-settings';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = getServerClient();
  
  try {
    const today = dayjs().tz().startOf('day');
    
    // SMS 설정 조회
    const SMS_ENABLED = await getSmsSettings();
    
    // DB에서 스케줄 템플릿 조회 (D-1, D-2 등)
    const { data: scheduleTemplates } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('trigger_type', 'SCHEDULE')
      .eq('is_active', true);

    if (!scheduleTemplates || scheduleTemplates.length === 0) {
      return NextResponse.json({ success: true, message: '활성화된 스케줄 템플릿 없음' });
    }

    // 🔒 안전장치: schedule_days_before가 null인 템플릿 경고
    const invalidTemplates = scheduleTemplates.filter(t => t.schedule_days_before === null);
    if (invalidTemplates.length > 0) {
      await supabase.from('system_logs').insert({
        event_type: EVENT_TYPE.SMS_WARNING,
        status: 'WARNING',
        message: `리마인더 템플릿 설정 오류`,
        error_detail: `schedule_days_before가 설정되지 않은 템플릿: ${invalidTemplates.map(t => t.name).join(', ')}`,
        process_status: LOG_PROCESS_STATUS.PENDING,
      });
    }

    // 고유한 days_before 값들 추출 (null 제외)
    const uniqueDaysBefore = Array.from(new Set(
      scheduleTemplates
        .filter(t => t.schedule_days_before !== null)
        .map(t => t.schedule_days_before)
    ));
    
    let totalSent = 0;
    let totalSkipped = 0;

    for (const daysBefore of uniqueDaysBefore) {
      const targetDate = today.add(daysBefore, 'day');
      const targetDateStr = targetDate.format('YYYY-MM-DD');
      const targetDayIndex = targetDate.day();
      const targetDayOfWeek = DAYS_ARRAY[targetDayIndex === 0 ? 6 : targetDayIndex - 1];

      // 해당 날짜에 수업이 있는 세션 조회
      const { data: sessions } = await supabase
        .from('sessions')
        .select(`
          *,
          user:users(id, name, phone),
          coach:coaches(id, name, phone),
          postponements(postponed_date)
        `)
        .eq('day_of_week', targetDayOfWeek)
        .eq('status', SESSION_STATUS.ACTIVE)
        .lte('start_date', targetDateStr)
        .gte('end_date', targetDateStr);

      if (!sessions) continue;

      // 해당 daysBefore의 템플릿들 (COACH_BRIEFING은 별도 처리하므로 제외)
      const templatesForDay = scheduleTemplates.filter(t => 
        t.schedule_days_before === daysBefore && t.event_type !== 'COACH_BRIEFING'
      );

      for (const session of sessions) {
        try {
          // 연기된 날짜 확인
          const postponedDates = session.postponements?.map((p: { postponed_date: string }) => p.postponed_date) || [];
          if (postponedDates.includes(targetDateStr)) {
            totalSkipped++;
            continue;
          }

          // 중복 발송 방지
          const reminderKey = `D${daysBefore}_${session.id}_${targetDateStr}`;
          const { data: existingReminder } = await supabase
            .from('reminder_logs')
            .select('id')
            .eq('session_id', session.id)
            .eq('remind_date', targetDateStr)
            .eq('reminder_type', `D${daysBefore}`)
            .single();

          if (existingReminder) {
            totalSkipped++;
            continue;
          }

          // 1회차 첫 수업 여부 체크 (코칭신청서 멘트 제외 조건)
          const isFirstLessonOfFirstSession = 
            session.extension_count === 0 && 
            session.start_date === targetDateStr;

          // 변수 준비 (종료일은 마지막 수업일 = end_date - 6일)
          const lastLessonDate = dayjs(session.end_date).subtract(6, 'day').format('YYYY-MM-DD');
          const variables = {
            수강생명: session.user?.name || '',
            코치명: session.coach?.name || '',
            요일: session.day_of_week,
            시간: session.start_time?.slice(0, 5) || '',
            시작일: session.start_date,
            종료일: lastLessonDate,
          };

          let sessionSentCount = 0;
          let sessionFailedCount = 0;

          // 각 템플릿별로 발송
        for (const template of templatesForDay) {
          // 1회차 첫수업이면 _FIRST 템플릿 사용, 아니면 일반 템플릿
          // REMINDER_D1_FIRST, REMINDER_D2_FIRST 템플릿이 있을 경우
          let useTemplate = template;
          
          if (isFirstLessonOfFirstSession && template.recipient_type === 'STUDENT') {
            // _FIRST 템플릿 찾기
            const firstTemplate = scheduleTemplates.find(t => 
              t.event_type === `${template.event_type}_FIRST` &&
              t.recipient_type === 'STUDENT'
            );
            if (firstTemplate) {
              useTemplate = firstTemplate;
            }
          }
          
          // _FIRST 템플릿은 별도 처리되므로 스킵 (중복 발송 방지)
          if (template.event_type.endsWith('_FIRST')) {
            continue;
          }
          
          let phone = '';
          let recipientType: 'STUDENT' | 'COACH' | 'ADMIN' = 'STUDENT';
          
          // SMS ON/OFF 체크
          if (useTemplate.recipient_type === 'STUDENT' && !SMS_ENABLED.STUDENT) {
            console.log('[리마인더] 수강생 문자 OFF - 스킵');
            continue;
          }
          if (useTemplate.recipient_type === 'COACH' && !SMS_ENABLED.COACH) {
            console.log('[리마인더] 코치 문자 OFF - 스킵');
            continue;
          }
          
          if (useTemplate.recipient_type === 'STUDENT') {
            phone = session.user?.phone || '';
            recipientType = 'STUDENT';
          } else if (useTemplate.recipient_type === 'COACH') {
            phone = session.coach?.phone || '';
            recipientType = 'COACH';
          }

          if (!phone) continue;

          const content = replaceVariables(useTemplate.content, variables);
          
          // 🔒 안전장치: 미치환 변수 있으면 발송 차단
          const unreplacedVars = content.match(/\{[^}]+\}/g);
          if (unreplacedVars && unreplacedVars.length > 0) {
            await supabase.from('system_logs').insert({
              event_type: EVENT_TYPE.SMS_WARNING,
              status: 'WARNING',
              message: `미치환 변수로 발송 차단: 리마인더`,
              error_detail: `템플릿 "${useTemplate.name}"에서 치환되지 않은 변수: ${unreplacedVars.join(', ')}`,
              process_status: LOG_PROCESS_STATUS.PENDING,
            });
            console.warn(`[리마인더] 미치환 변수로 발송 차단: ${unreplacedVars.join(', ')}`);
            sessionFailedCount++;
            continue; // 🚫 발송하지 않고 스킵
          }
          
          // 🔒 안전장치: 재시도 로직 (최대 2회)
          let lastError = '';
          let success = false;
          
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const result = await sendSms(phone, content, recipientType);
              if (result.success) {
                success = true;
                break;
              }
              lastError = result.error || '알 수 없는 오류';
            } catch (err) {
              lastError = err instanceof Error ? err.message : String(err);
            }
            
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          if (success) {
            // ✅ 성공 시 system_logs에도 기록 (대시보드 카운트용)
            await supabase.from('system_logs').insert({
              event_type: EVENT_TYPE.SMS_SENT,
              status: 'SUCCESS',
              message: `리마인더 발송 성공: ${phone.slice(-4)}`,
              process_status: LOG_PROCESS_STATUS.SUCCESS,
              raw_data: { sessionId: session.id, recipientType, daysBefore },
            });
            sessionSentCount++;
          } else {
            await supabase.from('system_logs').insert({
              event_type: EVENT_TYPE.SMS_FAILED,
              status: 'FAILED',
              message: `리마인더 발송 실패: ${phone.slice(-4)}`,
              error_detail: lastError,
              process_status: LOG_PROCESS_STATUS.PENDING,
              raw_data: { sessionId: session.id, recipientType, daysBefore },
            });
            console.error(`[리마인더] 발송 실패 (${template.recipient_type}):`, lastError);
            sessionFailedCount++;
          }
        }

        // 리마인더 로그 기록 (세션 단위)
        const reminderStatus = sessionFailedCount > 0 && sessionSentCount === 0 
          ? 'FAILED' 
          : sessionSentCount > 0 
            ? REMINDER_STATUS.SENT 
            : 'PENDING'; // SKIPPED 대신 PENDING 사용 (DB 제약조건)
            
        await supabase.from('reminder_logs').insert({
          session_id: session.id,
          remind_date: targetDateStr,
          reminder_type: `D${daysBefore}`,
          status: reminderStatus,
          sent_at: new Date().toISOString(),
        });

        if (sessionSentCount > 0) totalSent++;
        if (sessionFailedCount > 0) totalSkipped++;
        
        } catch (sessionError) {
          // 세션별 에러 격리 - 한 세션 실패해도 나머지 계속 진행
          console.error(`[리마인더] 세션 ${session.id} 처리 실패:`, sessionError);
          await supabase.from('system_logs').insert({
            event_type: EVENT_TYPE.SMS_WARNING,
            status: 'WARNING',
            message: `리마인더 세션 처리 실패: ${session.user?.name || session.id}`,
            error_detail: sessionError instanceof Error ? sessionError.message : String(sessionError),
            process_status: LOG_PROCESS_STATUS.PENDING,
          });
        }
      }
    }

    // ===== 코치 브리핑 (D-1) =====
    const coachBriefingTemplate = scheduleTemplates.find(
      t => t.event_type === 'COACH_BRIEFING' && t.schedule_days_before === 1
    );

    if (coachBriefingTemplate && SMS_ENABLED.COACH) {
      const targetDate = today.add(1, 'day');
      const targetDateStr = targetDate.format('YYYY-MM-DD');
      const targetDayIndex = targetDate.day();
      const targetDayOfWeek = DAYS_ARRAY[targetDayIndex === 0 ? 6 : targetDayIndex - 1];

      // D-1 날짜에 수업 있는 모든 세션 조회
      const { data: briefingSessions } = await supabase
        .from('sessions')
        .select(`
          *,
          user:users(id, name, phone),
          coach:coaches(id, name, phone),
          postponements(postponed_date)
        `)
        .eq('day_of_week', targetDayOfWeek)
        .eq('status', SESSION_STATUS.ACTIVE)
        .lte('start_date', targetDateStr)
        .gte('end_date', targetDateStr);

      if (briefingSessions && briefingSessions.length > 0) {
        // 코치별로 그룹핑
        const sessionsByCoach = new Map<string, { 
          coach: { id: string; name: string; phone: string }; 
          sessions: typeof briefingSessions 
        }>();

        for (const session of briefingSessions) {
          // 연기된 날짜 제외
          const postponedDates = session.postponements?.map((p: { postponed_date: string }) => p.postponed_date) || [];
          if (postponedDates.includes(targetDateStr)) continue;

          const coachId = session.coach?.id;
          if (!coachId || !session.coach?.phone) continue;

          if (!sessionsByCoach.has(coachId)) {
            sessionsByCoach.set(coachId, { 
              coach: session.coach, 
              sessions: [] 
            });
          }
          sessionsByCoach.get(coachId)!.sessions.push(session);
        }

        // 각 코치에게 브리핑 발송
        for (const [coachId, data] of sessionsByCoach) {
          try {
            // 중복 발송 방지
            const { data: existingBriefing } = await supabase
              .from('reminder_logs')
              .select('id')
              .eq('session_id', data.sessions[0].id) // 첫 세션으로 체크
              .eq('remind_date', targetDateStr)
              .eq('reminder_type', 'COACH_BRIEFING')
              .single();

            if (existingBriefing) continue;

            // 수업 목록 생성 (시간순 정렬)
            const sortedSessions = data.sessions.sort((a, b) => 
              (a.start_time || '').localeCompare(b.start_time || '')
            );
            
            const lessonList = sortedSessions
              .map(s => `• ${s.start_time?.slice(0, 5)} ${s.user?.name}`)
              .join('\n');

            // 변수 치환
            const content = replaceVariables(coachBriefingTemplate.content, {
              코치명: data.coach.name,
              수업목록: lessonList,
              총건수: String(data.sessions.length),
            });

            // 미치환 변수 체크
            const unreplacedVars = content.match(/\{[^}]+\}/g);
            if (unreplacedVars && unreplacedVars.length > 0) {
              await supabase.from('system_logs').insert({
                event_type: EVENT_TYPE.SMS_WARNING,
                status: 'WARNING',
                message: `미치환 변수로 발송 차단: 코치 브리핑`,
                error_detail: `치환되지 않은 변수: ${unreplacedVars.join(', ')}`,
                process_status: LOG_PROCESS_STATUS.PENDING,
              });
              continue;
            }

            // 발송
            const result = await sendSms(data.coach.phone, content, 'COACH');
            
            // 로그 기록
            await supabase.from('system_logs').insert({
              event_type: result.success ? EVENT_TYPE.SMS_SENT : EVENT_TYPE.SMS_FAILED,
              status: result.success ? 'SUCCESS' : 'FAILED',
              message: result.success 
                ? `코치 브리핑 발송 성공: ${data.coach.name}` 
                : `코치 브리핑 발송 실패: ${data.coach.name}`,
              error_detail: result.error,
              process_status: result.success ? LOG_PROCESS_STATUS.SUCCESS : LOG_PROCESS_STATUS.PENDING,
            });

            // reminder_logs에 기록 (첫 세션 ID로)
            await supabase.from('reminder_logs').insert({
              session_id: data.sessions[0].id,
              remind_date: targetDateStr,
              reminder_type: 'COACH_BRIEFING',
              status: result.success ? REMINDER_STATUS.SENT : 'FAILED',
              sent_at: new Date().toISOString(),
            });

            if (result.success) totalSent++;
            else totalSkipped++;

          } catch (briefingError) {
            console.error(`[코치 브리핑] ${data.coach.name} 처리 실패:`, briefingError);
          }
        }
      }
    }

    // 🔔 알림 폭탄 방지: 실패 건이 있으면 한 번만 요약 알림
    if (totalSkipped > 0 && process.env.ADMIN_PHONE_NUMBER) {
      try {
        await sendSms(
          process.env.ADMIN_PHONE_NUMBER,
          `[RCCC] 리마인더 발송 완료\n성공: ${totalSent}건, 실패: ${totalSkipped}건`,
          'ADMIN'
        );
      } catch (e) {
        console.error('[리마인더] 요약 알림 발송 실패:', e);
      }
    }

    // 시스템 로그
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.CRON_COMPLETED,
      status: 'SUCCESS',
      message: `리마인더 발송 완료: ${totalSent}건 발송, ${totalSkipped}건 스킵`,
      process_status: LOG_PROCESS_STATUS.SUCCESS,
    });

    return NextResponse.json({ 
      success: true, 
      data: {
        sent: totalSent,
        skipped: totalSkipped,
      }
    });
  } catch (error) {
    console.error('리마인더 크론잡 오류:', error);
    
    await supabase.from('system_logs').insert({
      event_type: EVENT_TYPE.SYSTEM_ERROR,
      status: 'FAILED',
      message: '리마인더 발송 크론잡 실패',
      error_detail: error instanceof Error ? error.message : String(error),
      process_status: LOG_PROCESS_STATUS.PENDING,
    });

    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}

// Vercel Cron에서 GET 요청으로도 동작하도록
export async function GET(req: Request) {
  return POST(req);
}
