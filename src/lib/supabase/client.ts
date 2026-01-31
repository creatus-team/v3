// lib/supabase/client.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 클라이언트 사이드에서 사용하는 Supabase 클라이언트
export function createBrowserClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

// 브라우저 클라이언트 싱글톤 인스턴스
let browserClient: SupabaseClient | null = null;

export function getBrowserClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserClient should only be called on the client side');
  }
  
  if (!browserClient) {
    browserClient = createBrowserClient();
  }
  return browserClient;
}
