/**
 * lib/authFlow.ts
 * 注册成功后「往哪走」的判断与用户可见文案
 *
 * 背景（为什么值得单独抽一块）：
 *   登录页此前**无条件**提示 "Please check your email to verify your account"。
 *   但 Supabase 的邮箱确认可能是关闭的（本项目线上 `mailer_autoconfirm = true`），
 *   此时 signUp 会**直接返回已登录会话** —— 用户其实已经进来了，
 *   却被要求去邮箱等验证邮件：他会离开页面去收信，然后卡在那里。
 *   对一个 $1.49 的产品，这是实打实的转化流失。
 *
 * 判断原则：**不看配置，看返回值**。
 *   supabase.auth.signUp() 返回的 data.session 是否为空，是唯一可靠依据 ——
 *   这样无论以后开不开邮箱确认，行为都自动正确，不需要再改代码。
 *
 * 本模块保持零依赖纯函数，便于被 scripts/verification/ 单独编译并回归测试。
 */

/** 注册成功后的两种走向 */
export type SignupOutcome =
  /** 已拿到会话：用户处于登录态，应直接进入应用 */
  | 'signed-in'
  /** 没有会话：需要用户去邮箱完成确认 */
  | 'await-confirmation';

/** Supabase signUp() 返回值中我们关心的部分 */
export interface SignupAuthData {
  session?: unknown | null;
  user?: { identities?: unknown[] | null } | null;
}

/**
 * 根据 signUp 的返回值判断注册后的走向。
 *
 * @param authData supabase.auth.signUp() 返回的 data
 *                 （缺失或形状异常时按「需要确认」处理 —— 宁可多提示一句去邮箱，
 *                   也不要错误地宣称用户已登录）
 */
export function resolveSignupOutcome(authData: SignupAuthData | null | undefined): SignupOutcome {
  if (authData && authData.session) {
    return 'signed-in';
  }

  // 没有会话 → 需要走邮箱确认。
  //
  // 这里同样涵盖「邮箱已注册 + 已开启枚举保护」的情况：Supabase 会返回一个
  // identities 为空的假 user 且不带 session，此时也应显示「去邮箱查看」，
  // 以免通过注册接口探测某个邮箱是否已存在。
  return 'await-confirmation';
}

/**
 * 两种走向对应的提示文案
 *
 * ⚠️ 'signed-in' 的文案**绝不能**再出现 "email" / "verify" / "confirm" 字样 ——
 *    那正是本次要修的问题（用户被误导去邮箱白等）。
 *    scripts/verification/auth-flow.test.js 会对这一点做断言。
 */
export const SIGNUP_SUCCESS_MESSAGES: Record<SignupOutcome, string> = {
  'signed-in': 'Account created! Taking you to your avatars…',
  'await-confirmation': 'Account created! Please check your email to verify your account.',
};
