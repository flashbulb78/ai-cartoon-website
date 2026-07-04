/**
 * lib/supabase/client.ts
 * Supabase 客户端配置（用于客户端）
 * 使用 @supabase/supabase-js 原生库
 * 
 * 重要：使用全局单例模式避免创建多个 GoTrueClient 实例
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 全局客户端存储 - 使用全局对象确保热重载后仍保持单例
 */
const globalClients: {
  browser?: SupabaseClient;
  admin?: SupabaseClient;
} = (global as typeof global & { __supabase_clients?: typeof globalClients }).__supabase_clients ||= {};

/**
 * 创建Supabase浏览器客户端（单例）
 * 用于客户端组件
 */
export function createBrowserClient(): SupabaseClient {
  if (globalClients.browser) {
    return globalClients.browser;
  }
  
  globalClients.browser = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
  
  return globalClients.browser;
}

/**
 * 创建Supabase客户端（别名，兼容旧代码）
 */
export function createClient(): SupabaseClient {
  return createBrowserClient();
}

/**
 * 创建Supabase Admin客户端（单例，使用Service Role）
 * 仅用于可信的服务端操作
 */
export function createAdminClient(): SupabaseClient {
  if (globalClients.admin) {
    return globalClients.admin;
  }
  
  globalClients.admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
  
  return globalClients.admin;
}
