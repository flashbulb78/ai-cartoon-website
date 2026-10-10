/**
 * app/auth/login/page.tsx
 * 登录/注册页（服务端外壳）
 *
 * 职责：读取 URL 上的 `?error=<code>`，用 lib/authErrors 解析成用户可读文案，
 *       再传给客户端表单渲染。
 *
 * 为什么由服务端读 searchParams（而不是在客户端用 useSearchParams）：
 *   本版本 Next.js 中 useSearchParams 会让客户端组件树退化为 CSR
 *   （官方文档明确说明，并推荐由 Server Component 读取 page 的 searchParams prop）。
 *   走服务端可以让错误提示直接出现在首屏 HTML 里，而不是水合后才闪出来。
 *   这与 app/pricing/ 的拆分方式一致。
 *
 * 该路由因此为动态渲染 —— 对登录页没有影响（robots.ts 已禁止抓取 /auth/*）。
 */

import type { Metadata } from 'next';
import { resolveAuthErrorMessage } from '@/lib/authErrors';
import LoginClient from './LoginClient';

export const metadata: Metadata = {
  title: 'Sign In',
  description:
    'Sign in or create a Magic Cartoon Avatar account and turn your photos into cartoon avatars in seconds.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  // 只接受受控错误码；无法识别的取值会被归一化成兜底文案，不会回显原始内容
  const errorMessage = resolveAuthErrorMessage(params.error);

  // key 说明：
  //   从 /auth/login?error=a 导航到 /auth/login?error=b 时（同一路由、同一组件实例），
  //   React 不会重新执行 useState 初始化，错误提示会停留在旧值。
  //   用 key 触发重新挂载即可保证错误提示与 URL 始终一致，且无需在 effect 里 setState。
  return <LoginClient key={errorMessage ?? 'no-error'} initialError={errorMessage} />;
}
