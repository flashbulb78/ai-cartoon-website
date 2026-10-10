/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行 tsc 编译出的 CommonJS 产物，必须使用 require */
/**
 * 认证错误映射回归测试
 * 覆盖：lib/authErrors.ts
 *
 * 运行方式：bash scripts/verification/run.sh
 * （该脚本会先把 lib/authErrors.ts 编译成 JS，再执行本文件）
 *
 * 背景：登录页此前完全不读 ?error= 参数，导致 OAuth 失败时用户看不到任何提示
 *       （表现为「按钮点了没反应」）。本模块是修复该问题的核心，一旦被改坏
 *       会重新退化成静默失效，因此必须有回归保护。
 */
const {
  AUTH_ERROR_MESSAGES,
  DEFAULT_AUTH_ERROR_MESSAGE,
  normalizeAuthErrorCode,
  resolveAuthErrorMessage,
  classifyAuthError,
} = require('./authErrors');

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
  console.log('\n--- 1. 无错误时不显示任何提示 ---');

  ok('无参数 → null（不误报）', resolveAuthErrorMessage(undefined) === null);
  ok('null → null', resolveAuthErrorMessage(null) === null);
  ok('空字符串 → null', resolveAuthErrorMessage('') === null);
  ok('纯空格 → null', resolveAuthErrorMessage('   ') === null);

  // =====================================================
  console.log('\n--- 2. 已知错误码 → 对应文案 ---');

  const accessDenied = resolveAuthErrorMessage('access_denied');
  ok(
    'access_denied → 提示用户是「取消授权」而非报错',
    typeof accessDenied === 'string' && /cancel/i.test(accessDenied),
    accessDenied
  );

  const alreadyRegistered = resolveAuthErrorMessage('email_already_registered');
  ok(
    'email_already_registered → 明确引导改用邮箱密码登录',
    typeof alreadyRegistered === 'string' && /already registered/i.test(alreadyRegistered),
    alreadyRegistered
  );

  ok(
    'exchange_failed → 非空文案',
    typeof resolveAuthErrorMessage('exchange_failed') === 'string'
  );
  ok(
    'missing_code → 非空文案',
    typeof resolveAuthErrorMessage('missing_code') === 'string'
  );
  ok(
    'server_error → 非空文案',
    typeof resolveAuthErrorMessage('server_error') === 'string'
  );
  ok(
    'auth_failed → 非空文案',
    typeof resolveAuthErrorMessage('auth_failed') === 'string'
  );

  // =====================================================
  console.log('\n--- 3. 数组取值（searchParams 可为 string[]）---');

  ok(
    '数组取第一个元素',
    resolveAuthErrorMessage(['missing_code', 'exchange_failed']) ===
      AUTH_ERROR_MESSAGES.missing_code
  );

  // =====================================================
  console.log('\n--- 4. 兜底与兼容 ---');

  const unknown = resolveAuthErrorMessage('some_unknown_code');
  ok('未知错误码 → 兜底文案（不静默）', unknown === DEFAULT_AUTH_ERROR_MESSAGE);

  ok(
    '遗留错误码 auth_callback_failed → 映射为 exchange_failed 文案',
    resolveAuthErrorMessage('auth_callback_failed') === AUTH_ERROR_MESSAGES.exchange_failed
  );

  // 结构测试：新增了错误码却忘了加文案，会在这里失败
  const allCodesHaveMessage = Object.entries(AUTH_ERROR_MESSAGES).every(
    ([, message]) => typeof message === 'string' && message.trim().length > 0
  );
  ok('所有已知错误码都有非空文案', allCodesHaveMessage);

  // 每个错误码都必须能被 normalizeAuthErrorCode 认出来（防止映射表与归一化逻辑脱节）
  const allCodesRoundTrip = Object.keys(AUTH_ERROR_MESSAGES).every(
    (code) => normalizeAuthErrorCode(code) === code
  );
  ok('所有已知错误码都能被 normalizeAuthErrorCode 识别（往返一致）', allCodesRoundTrip);

  // =====================================================
  console.log('\n--- 5. 安全：不把外部原文回显给用户 ---');

  const leakAttempt = resolveAuthErrorMessage(
    'ERROR: relation "profiles" does not exist (SQLSTATE 42P01)'
  );
  ok(
    '未知错误码不会把原始取值回显出来',
    leakAttempt === DEFAULT_AUTH_ERROR_MESSAGE && !leakAttempt.includes('SQLSTATE'),
    leakAttempt
  );

  const internalTerms = ['supabase', 'error_description', 'error_code', 'sqlstate'];
  const messagesLeakInternals = Object.values(AUTH_ERROR_MESSAGES)
    .concat([DEFAULT_AUTH_ERROR_MESSAGE])
    .filter((message) => internalTerms.some((term) => message.toLowerCase().includes(term)));
  ok(
    '文案中不含内部技术术语',
    messagesLeakInternals.length === 0,
    messagesLeakInternals.length ? messagesLeakInternals.join(' | ') : undefined
  );

  // =====================================================
  console.log('\n--- 6. classifyAuthError：原始错误 → 受控错误码 ---');

  ok(
    "('access_denied', null) → access_denied",
    classifyAuthError('access_denied', null) === 'access_denied'
  );
  ok(
    "大小写不敏感：('Access_Denied', null) → access_denied",
    classifyAuthError('Access_Denied', null) === 'access_denied'
  );
  ok(
    "(null, 'User already registered') → email_already_registered",
    classifyAuthError(null, 'User already registered') === 'email_already_registered'
  );
  ok(
    "(null, 'Email address already in use') → email_already_registered",
    classifyAuthError(null, 'Email address already in use') === 'email_already_registered'
  );
  ok(
    "(null, 'Identity is already linked to another user') → email_already_registered",
    classifyAuthError(null, 'Identity is already linked to another user') ===
      'email_already_registered'
  );
  ok(
    "('server_error', null) → server_error",
    classifyAuthError('server_error', null) === 'server_error'
  );
  ok(
    "受控码直接透传：('missing_code', null) → missing_code",
    classifyAuthError('missing_code', null) === 'missing_code'
  );
  ok(
    "完全未知：('weird_thing', 'boom') → auth_failed（兜底）",
    classifyAuthError('weird_thing', 'boom') === 'auth_failed'
  );
  ok(
    '空输入：(null, null) → auth_failed（不抛异常）',
    classifyAuthError(null, null) === 'auth_failed'
  );
  ok(
    "空字符串：(undefined, '') → auth_failed（不抛异常）",
    classifyAuthError(undefined, '') === 'auth_failed'
  );

  // =====================================================
  console.log('\n--- 7. 链路一致性：分类结果必须都能取到文案 ---');

  const classifyCases = [
    ['access_denied', null],
    [null, 'User already registered'],
    ['server_error', null],
    ['missing_code', null],
    ['exchange_failed', null],
    ['weird', 'boom'],
  ];
  const chainOk = classifyCases.every(([code, desc]) => {
    const message = resolveAuthErrorMessage(classifyAuthError(code, desc));
    return typeof message === 'string' && message.length > 0;
  });
  ok('classifyAuthError 的每种输出都能被 resolveAuthErrorMessage 转成文案', chainOk);

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

