/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行（CommonJS），必须使用 require */
/**
 * Google OAuth 配置验收脚本
 *
 * 用法：
 *   node scripts/verify-oauth-setup.js
 *   node scripts/verify-oauth-setup.js https://www.magicyoyoyo.com   # 指定站点地址
 *
 * 为什么单独一个脚本（不放进 scripts/verification/run.sh）：
 *   它需要访问网络（Supabase 与你的站点），放进离线回归测试会让测试变得不可靠。
 *   建议在「改完 Google / Supabase 配置后」以及「上线巡检」时手动运行。
 *
 * 它检查什么：
 *   1. Supabase 的公共 settings 端点（权威来源）→ provider 是否真的启用
 *   2. /auth/v1/authorize → 授权端点是否真的跳去 Google（端到端，不只信开关）
 *   3. 站点上的 /api/auth/callback → 回调路由是否在线
 *   4. 顺带报告 email provider / 邮箱确认 / 是否允许注册等影响转化率的开关
 */
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.resolve(__dirname, '..', '.env.local');

let pass = 0;
let fail = 0;
let warn = 0;

function line(status, name, detail) {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️ ';
  console.log(`${icon} ${name}`);
  if (detail) console.log(`   ${detail}`);
  if (status === 'pass') pass += 1;
  else if (status === 'fail') fail += 1;
  else warn += 1;
}

/** 读取 .env.local（只取需要的三项，不打印任何密钥） */
function readEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    return { error: `.env.local 不存在：${ENV_FILE}` };
  }

  const raw = fs.readFileSync(ENV_FILE, 'utf8');
  const values = {};
  // 注意：用 /\r?\n/ 而不是 split('\n')。
  // .env.local 可能是 CRLF 换行，残留的 \r 会让下面的 /(.*)$/ 匹配失败
  // （JS 正则中 . 不匹配 \r），结果是一个变量都读不出来。
  for (const rawLine of raw.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }

  return {
    supabaseUrl: (values.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: values.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    siteUrl: (values.NEXT_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  };
}

/** 发起请求并保留重定向信息（不自动跟随，才能看到每一跳） */
async function probe(url, options = {}) {
  try {
    const response = await fetch(url, { redirect: 'manual', ...options });
    return {
      ok: true,
      status: response.status,
      // 跟随重定向时，url 是最终落点；不跟随时即请求地址
      url: response.url || url,
      location: response.headers.get('location') || '',
      body: await response.text(),
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function checkProviders(env) {
  console.log('\n--- 1. Supabase provider 开关（权威来源）---');
  const settings = await probe(`${env.supabaseUrl}/auth/v1/settings`, {
    headers: env.anonKey ? { apikey: env.anonKey } : {},
  });

  if (!settings.ok || settings.status !== 200) {
    line('fail', '无法读取 Supabase settings 端点', settings.error || `HTTP ${settings.status}`);
    return;
  }

  let data = {};
  try {
    data = JSON.parse(settings.body);
  } catch {
    /* 解析失败按缺省处理 */
  }

  const external = data.external || {};

  line(
    external.google === true ? 'pass' : 'fail',
    'Google provider 已启用',
    external.google === true
      ? undefined
      : '当前为 false —— 需在 Supabase → Authentication → Providers → Google 填入 Client ID / Secret 并启用'
  );
  line(
    external.email === true ? 'pass' : 'fail',
    'Email provider 已启用（邮箱密码注册登录）',
    external.email === true ? undefined : '当前为 false —— 邮箱注册会被拒绝'
  );
  line(
    data.disable_signup === false ? 'pass' : 'fail',
    '允许新用户注册（disable_signup = false）',
    data.disable_signup === true ? '当前为 true —— 新用户无法注册，请关闭该开关' : undefined
  );

  if (data.mailer_autoconfirm === true) {
    line(
      'warn',
      '邮箱确认已关闭（mailer_autoconfirm = true）',
      '注册即登录，用户无需点击邮件链接。登录页已按 signUp 的返回值自动处理（见 lib/authFlow.ts）：有会话就直接进入应用，不会误导用户去邮箱'
    );
  } else {
    line(
      'warn',
      '邮箱确认已开启（用户需点击邮件链接才能登录）',
      '这会增加注册流失（用户必须离开站点去收件箱）。登录页会自动提示"去邮箱验证"（见 lib/authFlow.ts），行为正确'
    );
  }

  const others = Object.entries(external)
    .filter(([key, value]) => value === true && !['email', 'google'].includes(key))
    .map(([key]) => key);
  if (others.length > 0) {
    line('warn', `其他已启用的登录方式：${others.join(', ')}`, '若非有意开启，建议关闭以减小攻击面');
  }
}

async function checkAuthorizeEndpoint(env, callbackUrl) {
  console.log('\n--- 2. 端到端：授权端点是否真的会跳去 Google ---');
  const authorizeUrl =
    `${env.supabaseUrl}/auth/v1/authorize?provider=google` +
    (callbackUrl ? `&redirect_to=${encodeURIComponent(callbackUrl)}` : '');
  const authorize = await probe(authorizeUrl);

  if (!authorize.ok) {
    line('fail', '无法访问 Supabase 授权端点', authorize.error);
    return;
  }
  if (authorize.status >= 300 && authorize.status < 400 && /accounts\.google\.com/.test(authorize.location)) {
    line('pass', '授权端点正确跳转到 Google', `HTTP ${authorize.status} → ${authorize.location.slice(0, 80)}…`);
    return;
  }
  if (authorize.status === 400 && /provider is not enabled/i.test(authorize.body)) {
    line(
      'fail',
      '授权端点返回「Unsupported provider: provider is not enabled」',
      '这正是用户点击 Continue with Google 后看到的白底报错页 —— 请先完成 Supabase 的 Google provider 配置'
    );
    return;
  }
  line(
    'fail',
    `授权端点返回了意外结果：HTTP ${authorize.status}`,
    (authorize.location || authorize.body || '').slice(0, 120)
  );
}

async function checkCallbackRoute(siteUrl, callbackUrl) {
  console.log('\n--- 3. 站点侧：回调路由是否真的在上线状态 ---');
  if (!siteUrl) {
    line('warn', '未配置站点地址，跳过', '请在 .env.local 设置 NEXT_PUBLIC_BASE_URL，或用参数传入');
    return;
  }

  // 先看不跟随的结果：确认 trailingSlash 的 308（本项目启用 trailingSlash）
  const head = await probe(callbackUrl);
  if (!head.ok) {
    line('fail', `${callbackUrl} 无法访问`, head.error);
    return;
  }

  // 再跟随到底：只有路由逻辑真正在线，无 code 时才会回到登录页并带上 missing_code。
  // （仅看 308 不足以证明路由存在 —— trailingSlash 的跳转与路由是否存在无关）
  const followed = await probe(callbackUrl, { redirect: 'follow' });
  const landedUrl = followed.url || '';

  if (!followed.ok) {
    line('fail', '跟随重定向失败', followed.error);
  } else if (followed.status === 200 && /\/auth\/login\/?\?error=missing_code/.test(landedUrl)) {
    line('pass', '回调路由已上线且逻辑正确', `无 code 时回到登录页并给出 missing_code：${landedUrl}`);
    if (head.status >= 300 && head.status < 400) {
      console.log(`   （第一跳为 HTTP ${head.status} → ${head.location}，是 trailingSlash 的预期行为）`);
    }
  } else if (/\/auth\/login\/?\?error=/.test(landedUrl)) {
    line('warn', '回调路由在线，但无 code 时返回了其它错误码', landedUrl);
  } else {
    line(
      'fail',
      '回调路由似乎未生效',
      `跟随重定向后落到：${landedUrl || '(无)'}，HTTP ${followed.status} —— 请确认最新代码已部署`
    );
  }
}

function printGuidance(env, siteUrl, callbackUrl) {
  const site = siteUrl || 'https://你的域名';
  console.log('\n--- 若上述有失败项，按这个顺序处理 ---');
  console.log(`
1) Google Cloud Console → APIs & Services → Credentials
   新建 OAuth client ID（Web application）：
     Authorized JavaScript origins:  ${site} , http://localhost:3000
     Authorized redirect URIs:       ${env.supabaseUrl}/auth/v1/callback   ← 是 Supabase 的地址，不是你站的
2) 同页 → OAuth consent screen：填 App name / 支持邮箱 / 隐私政策 URL
   → 然后 Publish app（留在 Testing 时只有 100 个测试账号能登录）
3) Supabase → Authentication → Providers → Google：粘贴 Client ID / Secret → 启用 → Save
4) Supabase → Authentication → URL Configuration：
     Site URL:       ${site}
     Redirect URLs:  ${callbackUrl}
                     ${site}/auth/reset-password
                     http://localhost:3000/api/auth/callback
                     http://localhost:3000/auth/reset-password
   ⚠️ 必须与代码发出的 redirectTo 完全一致：/api/auth/callback，**不带**尾斜杠
5) 重新运行本脚本确认，再在无痕窗口实测一次 Google 登录
`);
}

async function main() {
  const env = readEnv();
  if (env.error) {
    console.error(`\n❌ ${env.error}\n`);
    process.exit(1);
  }
  if (!env.supabaseUrl) {
    console.error('\n❌ 环境变量缺少 NEXT_PUBLIC_SUPABASE_URL\n');
    process.exit(1);
  }

  const siteUrl = (process.argv[2] || env.siteUrl || '').replace(/\/+$/, '');
  const callbackUrl = `${siteUrl}/api/auth/callback`;

  console.log('\n================ Google OAuth 配置验收 ================');
  console.log(`Supabase 项目 : ${env.supabaseUrl.replace(/^https:\/\//, '')}`);
  console.log(`站点地址     : ${siteUrl || '(未配置)'}`);
  console.log('======================================================');

  await checkProviders(env);
  await checkAuthorizeEndpoint(env, siteUrl ? callbackUrl : '');
  await checkCallbackRoute(siteUrl, callbackUrl);

  if (fail > 0) {
    printGuidance(env, siteUrl, callbackUrl);
  }

  console.log(`\n########## 结果：${pass} 通过 / ${fail} 失败 / ${warn} 提示 ##########\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\n❌ 脚本执行异常：', error);
  process.exit(1);
});

