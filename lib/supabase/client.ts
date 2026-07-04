/**
 * lib/supabase/client.ts
 * Supabase 客户端配置（用于客户端）
 * 使用 @supabase/ssr 包
 */

import { createBrowserClient } from '@supabase/ssr';

/**
 * 创建Supabase浏览器客户端
 * 用于客户端组件
 * @supabase/ssr 自动处理 cookie 存储和认证上下文
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * 创建Supabase Admin客户端（使用Service Role）
 * 注意：此函数仅用于客户端组件中需要管理员权限的操作
 * Service Role Key 会暴露给浏览器，仅在必要时使用
 */
export function createAdminClient() {
  // 注意：这里使用 ANON_KEY 而不是 SERVICE_ROLE_KEY，因为这是客户端代码
  // 实际的管理权限应该在服务端验证
  // @deprecated 请使用服务端 API 获取管理员数据
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
