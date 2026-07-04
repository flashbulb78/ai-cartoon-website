/**
 * lib/supabase/server.ts
 * Supabase 服务端配置（用于服务端API路由和Server Components）
 * 使用 @supabase/ssr 包
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * 创建Supabase服务端客户端
 * 用于服务端API路由和Server Components
 * 自动处理 cookie 和认证上下文
 */
export async function createClient(): Promise<ReturnType<typeof createServerClient>> {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // 在 Server Components 中调用 setAll 可能会有问题，忽略错误
          }
        },
      },
    }
  );
}

/**
 * 创建Supabase Admin客户端（使用Service Role）
 * 仅用于可信的服务端操作，如创建用户、扣减次数等
 * 注意：使用 Service Role Key 会绕过 RLS
 */
export function createAdminClient(): ReturnType<typeof createServerClient> {
  // Admin 客户端不使用 cookie 存储，因为它是服务间通信
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // 不需要在服务端存储 cookie
        },
      },
    }
  );
}
