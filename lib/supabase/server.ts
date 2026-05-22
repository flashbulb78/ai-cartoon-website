/**
 * lib/supabase/server.ts
 * Supabase 服务端配置（用于服务端API路由）
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * 创建Supabase服务端客户端
 * 用于服务端API路由和Server Components
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        /** 获取cookie */
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        /** 设置cookie */
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // 在Server Components中忽略错误
          }
        },
        /** 移除cookie */
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // 在Server Components中忽略错误
          }
        },
      },
    }
  );
}

/**
 * 创建Supabase Admin客户端（使用Service Role）
 * 仅用于可信的服务端操作，如创建用户、扣减次数等
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