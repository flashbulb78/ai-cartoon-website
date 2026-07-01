/**
 * lib/supabase/client.ts
 * Supabase 客户端配置（用于客户端）
 * 使用 @supabase/supabase-js 原生库
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 创建Supabase浏览器客户端
 * 用于客户端组件
 */
export function createBrowserClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
}

/**
 * 创建Supabase客户端（别名，兼容旧代码）
 */
export function createClient(): SupabaseClient {
  return createBrowserClient();
}

/**
 * 创建Supabase Admin客户端（使用Service Role）
 * 仅用于可信的服务端操作
 */
export function createAdminClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
