/**
 * lib/authErrors.ts
 * 认证错误码 → 用户可读文案 的**单一映射来源**
 *
 * 背景（为什么需要这个模块）：
 *   登录/注册失败时，Supabase 或我们的回调接口会把结果以 `?error=<code>` 的形式
 *   带回登录页。此前登录页**完全不读这个参数**，于是任何 OAuth 故障在用户眼里
 *   都表现为「点了按钮没反应」—— 属于最难排查的静默失效。
 *
 * 两条约定：
 *   1. 只映射**我们自己的**受控错误码，绝不把 Supabase 返回的原文直接展示给用户
 *      （原文含内部实现细节和英文技术术语，既难看也不安全）。
 *   2. `classifyAuthError()` 负责把 Supabase 的原始 `error` / `error_description`
 *      归一化成受控错误码，再放进 URL —— 保证 URL 里不会出现外部字符串被原样回显。
 *
 * 本模块必须保持「零依赖纯函数」，以便被 scripts/verification/ 单独编译并回归测试。
 */

/** 受控错误码（同时也是 URL 中 `?error=` 的合法取值） */
export type AuthErrorCode =
  | 'access_denied'
  | 'email_already_registered'
  | 'exchange_failed'
  | 'missing_code'
  | 'auth_failed'
  | 'server_error';

/** 错误码 → 面向用户的英文文案（站点面向英文用户） */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  access_denied:
    'Google sign-in was cancelled. You can try again, or sign in with your email below.',
  email_already_registered:
    'This email is already registered with a password. Please sign in with your email and password below.',
  exchange_failed:
    'We could not complete the sign-in. Please try again, or use your email and password.',
  missing_code:
    'That sign-in link is invalid or has expired. Please start again.',
  auth_failed:
    'Sign-in failed. Please try again, or use your email and password.',
  server_error:
    'Something went wrong on our side. Please try again in a moment.',
};

/** 取值无法识别时的兜底文案（宁可给一句笼统提示，也不要静默） */
export const DEFAULT_AUTH_ERROR_MESSAGE = 'Sign-in failed. Please try again.';

/**
 * 历史遗留错误码 → 现行错误码的兼容别名
 * （旧的回调页曾使用 auth_callback_failed，用户可能仍持有旧链接/旧标签页）
 */
const LEGACY_ALIASES: Record<string, AuthErrorCode> = {
  auth_callback_failed: 'exchange_failed',
};

/**
 * 把 URL 中的原始取值归一化成受控错误码；无法识别时返回 null。
 *
 * @param raw searchParams 里的取值（可能是数组，取第一个）
 */
export function normalizeAuthErrorCode(
  raw: string | string[] | null | undefined
): AuthErrorCode | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;

  const code = value.trim();
  if (!code) return null;

  if (Object.prototype.hasOwnProperty.call(AUTH_ERROR_MESSAGES, code)) {
    return code as AuthErrorCode;
  }

  return LEGACY_ALIASES[code] ?? null;
}

/**
 * URL 中的 `?error=` → 展示给用户的文案。
 *
 * 行为约定：
 *   - 没有 error 参数 / 空字符串            → null（不显示任何提示）
 *   - 已知错误码 / 遗留别名                 → 对应文案
 *   - 有值但无法识别                        → 兜底文案（不静默、也不回显原值）
 */
export function resolveAuthErrorMessage(
  raw: string | string[] | null | undefined
): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  if (!value.trim()) return null;

  const code = normalizeAuthErrorCode(value);
  return code ? AUTH_ERROR_MESSAGES[code] : DEFAULT_AUTH_ERROR_MESSAGE;
}

/**
 * 把 Supabase 回调返回的原始错误归一化成受控错误码。
 *
 * 用途：`app/api/auth/callback/route.ts` 收到 `?error=` / `?error_description=`
 *       时，先用本函数转成受控码，再重定向回登录页 —— 这样重定向 URL 中
 *       永远只有我们自己定义的取值。
 *
 * @param errorCode        Supabase 的 error（如 access_denied）
 * @param errorDescription Supabase 的 error_description（自由文本，仅用于关键词判断）
 */
export function classifyAuthError(
  errorCode: string | null | undefined,
  errorDescription: string | null | undefined
): AuthErrorCode {
  const code = (errorCode ?? '').trim().toLowerCase();
  const desc = (errorDescription ?? '').toLowerCase();

  // 用户在 Google 授权页点了「取消」/ 拒绝授权
  if (code === 'access_denied' || desc.includes('access_denied')) {
    return 'access_denied';
  }

  // 该邮箱已用其它方式注册过（例如先用邮箱密码注册，又点了 Google 登录）
  // Supabase 的常见文案：
  //   "User already registered" / "Email address already in use"
  //   / "Identity is already linked to another user"
  if (
    desc.includes('already registered') ||
    desc.includes('already exists') ||
    desc.includes('already in use') ||
    desc.includes('already linked')
  ) {
    return 'email_already_registered';
  }

  if (code === 'server_error') {
    return 'server_error';
  }

  // 包含 missing_code / exchange_failed 等我们自己抛出的受控码
  const own = normalizeAuthErrorCode(code);
  if (own) return own;

  return 'auth_failed';
}
