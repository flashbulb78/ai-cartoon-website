/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行 tsc 编译出的 CommonJS 产物，必须使用 require */
/**
 * 注册流程走向判断的回归测试
 * 覆盖：lib/authFlow.ts
 *
 * 运行方式：bash scripts/verification/run.sh
 *
 * 背景：登录页此前**无条件**提示 "Please check your email to verify your account"，
 *       而线上 Supabase 的邮箱确认实际是关闭的（mailer_autoconfirm = true）——
 *       注册即登录，用户却被要求去邮箱等验证邮件，在收件箱里白等并流失。
 *       本测试把「已登录就绝不能再让用户去邮箱」这件事钉住。
 */
const { resolveSignupOutcome, SIGNUP_SUCCESS_MESSAGES } = require('./authFlow');

let pass = 0;
let fail = 0;

function ok(name, condition, detail) {
  console.log(`${condition ? '✅' : '❌'} ${name}`);
  if (detail) console.log(`   ${detail}`);
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
  }
}

function main() {
  // =====================================================
  console.log('\n--- 1. 走向判断：以 signUp 返回值为唯一依据 ---');

  ok(
    'session 非空 → signed-in（用户已登录，应直接进入应用）',
    resolveSignupOutcome({ session: { access_token: 'x' }, user: { id: 'u1' } }) === 'signed-in'
  );
  ok(
    'session 为 null → await-confirmation（需要去邮箱确认）',
    resolveSignupOutcome({ session: null, user: { id: 'u1' } }) === 'await-confirmation'
  );
  ok(
    'data 为 undefined → await-confirmation（安全默认，不误判为已登录）',
    resolveSignupOutcome(undefined) === 'await-confirmation'
  );
  ok(
    'data 为 null → await-confirmation（安全默认）',
    resolveSignupOutcome(null) === 'await-confirmation'
  );
  ok(
    'session 为 undefined → await-confirmation（安全默认）',
    resolveSignupOutcome({ user: { id: 'u1' } }) === 'await-confirmation'
  );
  ok(
    '开启枚举保护时（user.identities 为空且无 session）→ await-confirmation',
    resolveSignupOutcome({ session: null, user: { identities: [] } }) === 'await-confirmation'
  );
  ok(
    '异常形状（session 为字符串等真值）→ signed-in（只判断有无会话）',
    resolveSignupOutcome({ session: 'sentinel' }) === 'signed-in'
  );

  // =====================================================
  console.log('\n--- 2. 核心回归：已登录时不得让用户去邮箱 ---');

  const signedInMessage = SIGNUP_SUCCESS_MESSAGES['signed-in'];
  const forbidden = ['email', 'verify', 'verification', 'confirm', 'inbox', 'mail'];

  const leaked = forbidden.filter((word) => signedInMessage.toLowerCase().includes(word));
  ok(
    '「已登录」文案不出现 email / verify / confirm 等字样',
    leaked.length === 0,
    leaked.length ? `出现了：${leaked.join(', ')} → "${signedInMessage}"` : signedInMessage
  );
  ok(
    '「已登录」文案确实表达了「正在进入应用」',
    /taking you/i.test(signedInMessage)
  );

  const confirmMessage = SIGNUP_SUCCESS_MESSAGES['await-confirmation'];
  ok(
    '「需确认」文案明确提示去查看邮箱',
    /email/i.test(confirmMessage),
    confirmMessage
  );

  // =====================================================
  console.log('\n--- 3. 结构完整性 ---');

  const outcomes = ['signed-in', 'await-confirmation'];
  const allHaveMessage = outcomes.every(
    (outcome) =>
      typeof SIGNUP_SUCCESS_MESSAGES[outcome] === 'string' &&
      SIGNUP_SUCCESS_MESSAGES[outcome].trim().length > 0
  );
  ok('每种走向都有非空文案', allHaveMessage);

  ok(
    '两种文案互不相同（避免又退化成"一条文案走天下"）',
    SIGNUP_SUCCESS_MESSAGES['signed-in'] !== SIGNUP_SUCCESS_MESSAGES['await-confirmation']
  );

  ok('两种走向的取值集合与文案表一致', Object.keys(SIGNUP_SUCCESS_MESSAGES).length === outcomes.length);

  // =====================================================
  console.log(`\n########## 结果：${pass} 通过 / ${fail} 失败 ##########\n`);
  process.exit(fail > 0 ? 1 : 0);
}

try {
  main();
} catch (error) {
  console.error('测试执行异常:', error);
  process.exit(1);
}
