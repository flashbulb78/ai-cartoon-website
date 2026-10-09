/**
 * lib/supabase/server.ts
 * Supabase 服务端配置（用于服务端API路由和Server Components）
 * 使用 @supabase/ssr 包
 */

import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
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
 * 创建「匿名只读」Supabase 客户端（**不读取 cookies**）
 *
 * 用途：在服务端渲染公开数据（如定价套餐）并配合 ISR 缓存时使用。
 *
 * 为什么不复用上面的 createClient()：
 *   它内部调用 cookies()，这会让整个路由转为「动态渲染」，
 *   从而使 `export const revalidate = N`（ISR）失效 —— 页面就不再是静态的。
 *   而公开数据本来就与用户身份无关，也不需要读取会话。
 *
 * 注意：此客户端使用 anon key，受 RLS 约束，只能读取公开数据。
 */
export function createPublicReadClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // 纯服务端公开读取，无需维持会话
        persistSession: false,
        autoRefreshToken: false,
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
