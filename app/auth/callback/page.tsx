/**
 * app/auth/callback/page.tsx
 * OAuth 回调的**兼容入口**（只做转发，不含任何业务逻辑）
 *
 * 背景：
 *   Google 登录的回调地址现在直接指向服务端接口 `app/api/auth/callback/route.ts`
 *   —— code 交换、登录日志落库、错误归一化都在那一处完成。
 *
 * 本页面保留的意义（兜底，不是主链路）：
 *   若 Supabase 的 Redirect URL 白名单未及时更新，或用户持有历史链接/旧标签页，
 *   请求会落到这里。它不做任何处理，只把查询串原样转给服务端接口，
 *   保证全站只有**一条**认证回调链路（避免两份实现各自失效）。
 *
 * 为什么用 redirect() 而不是 useEffect + exchangeCodeForSession：
 *   旧实现是在浏览器里做 code 交换，失败时靠 router.push 回登录页 —— 一旦失败
 *   用户看不到任何提示。改成服务端 307 跳转后，处理逻辑单点化，无静默失败空间。
 */

import { redirect } from 'next/navigation';

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  // 原样转发查询串（code / error / error_description 统一交给服务端接口处理）
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      query.set(key, value);
    } else if (Array.isArray(value) && typeof value[0] === 'string') {
      query.set(key, value[0]);
    }
  }

  const suffix = query.toString();
  // 带尾斜杠：本项目启用了 trailingSlash，内部跳转若不带斜杠会多出一次 308
  redirect(`/api/auth/callback/${suffix ? `?${suffix}` : ''}`);
}
