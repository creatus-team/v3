// lib/utils/sms-settings.ts
import { getServerClient } from '@/lib/supabase/server';

export interface SmsEnabledSettings {
  STUDENT: boolean;
  COACH: boolean;
  ADMIN: boolean;
}

const DEFAULT_SETTINGS: SmsEnabledSettings = {
  STUDENT: false,
  COACH: false,
  ADMIN: true,
};

// SMS 설정 읽기
export async function getSmsSettings(): Promise<SmsEnabledSettings> {
  try {
    const supabase = getServerClient();
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'sms_enabled')
      .single();

    if (error || !data) {
      console.warn('SMS 설정 조회 실패, 기본값 사용:', error);
      return DEFAULT_SETTINGS;
    }

    return data.value as SmsEnabledSettings;
  } catch (err) {
    console.error('SMS 설정 조회 오류:', err);
    return DEFAULT_SETTINGS;
  }
}

// SMS 설정 저장
export async function updateSmsSettings(settings: SmsEnabledSettings): Promise<boolean> {
  try {
    const supabase = getServerClient();
    const { error } = await supabase
      .from('system_settings')
      .update({ 
        value: settings,
        updated_at: new Date().toISOString(),
      })
      .eq('key', 'sms_enabled');

    if (error) {
      console.error('SMS 설정 저장 실패:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('SMS 설정 저장 오류:', err);
    return false;
  }
}
