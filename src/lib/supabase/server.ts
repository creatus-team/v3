// lib/supabase/server.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 서버 사이드에서 사용하는 Supabase 클라이언트 (Service Role Key 사용)
export function createServerClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// 서버 클라이언트 싱글톤 인스턴스
let serverClient: SupabaseClient | null = null;

export function getServerClient(): SupabaseClient {
  if (!serverClient) {
    serverClient = createServerClient();
  }
  return serverClient;
}
