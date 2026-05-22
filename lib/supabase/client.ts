/**
 * lib/supabase/client.ts
 * Supabase 客户端配置（用于客户端）
 */

import { createBrowserClient } from '@supabase/ssr';

/**
 * 创建Supabase浏览器客户端
 * 用于客户端组件
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * 创建Supabase Admin客户端（使用Service Role）
 * 仅用于可信的服务端操作
 */
export function createAdminClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
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