/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行 tsc 编译出的 CommonJS 产物，必须使用 require */
/**
 * 法律信息一致性回归测试
 * 覆盖：lib/legalConfig.ts、app/privacy/page.tsx、app/terms/page.tsx、
 *       components/PrivacyConsentModal.tsx、app/sitemap.ts
 *
 * 运行方式：bash scripts/verification/run.sh
 *
 * 为什么需要这个测试：
 *   法律页面与隐私告知最容易以「静默」的方式变错：
 *     1. 有人改了数据处理逻辑（比如新增一个第三方服务），却忘了更新隐私政策
 *        → 页面上的声明与实际行为不符（比没有政策更糟）
 *     2. 有人把弹窗文案改回「图片不会上传/不会保存」之类的失实表述
 *        → 同意失去法律基础，用户信任受损
 *     3. 新加的法律页忘了进 sitemap，或漏掉了运营主体/联系邮箱
 *   这些都是「不报错但错了」的问题，因此必须有回归保护。
 */
const fs = require('fs');
const path = require('path');

const {
  OPERATOR_NAME,
  SUPPORT_EMAIL,
  SERVICE_DOMAIN,
  GOVERNING_LAW,
  JURISDICTION_VENUE,
  REFUND_WINDOW_DAYS,
  GENERATION_HISTORY_LIMIT,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_EFFECTIVE_DATE_TEXT,
  getPendingLegalTodos,
} = require('./legalConfig');

// 编译产物位于 <repo>/.verify-build/，故项目根目录为其上一级
const ROOT = path.resolve(__dirname, '..');

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

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** 返回 source 中**缺失**的关键词（空数组表示全部命中） */
function missing(source, needles) {
  return needles.filter((needle) => !source.includes(needle));
}

/**
 * 折叠所有空白（含换行）后再匹配。
 *
 * 必要性：页面源码里的句子会因排版折行而被拆开，
 * 例如 "... forwarded to our AI processing\n  provider ..." ——
 * 直接 includes() 会漏判，从而产生假失败。
 * 对「文案内容」做断言时一律先用本函数归一化。
 */
function normalize(source) {
  return source.replace(/\s+/g, ' ');
}

function main() {
  const privacyPage = read('app/privacy/page.tsx');
  const termsPage = read('app/terms/page.tsx');
  const consentModal = read('components/PrivacyConsentModal.tsx');
  const sitemap = read('app/sitemap.ts');

  // 只检查 CONSENT_TEXTS 里的**面向用户的文案**。
  // 文件顶部的注释会引用历史失实表述作为说明，那不是违规内容，
  // 因此不能对整份源码做断言。
  const consentTextsStart = consentModal.indexOf('const CONSENT_TEXTS');
  const consentTextsEnd = consentModal.indexOf('\n};', consentTextsStart);
  const consentTexts = consentModal.slice(consentTextsStart, consentTextsEnd);

  const privacyText = normalize(privacyPage);
  const termsText = normalize(termsPage);
  const consentText = normalize(consentTexts);

  // =====================================================
  console.log('\n--- 1. 法律配置有效性（缺一项就可能导致政策不合法）---');

  ok('OPERATOR_NAME 非空', typeof OPERATOR_NAME === 'string' && OPERATOR_NAME.trim().length > 0, OPERATOR_NAME);
  ok(
    'SUPPORT_EMAIL 是合法邮箱',
    typeof SUPPORT_EMAIL === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SUPPORT_EMAIL),
    SUPPORT_EMAIL
  );
  ok('SERVICE_DOMAIN 非空', typeof SERVICE_DOMAIN === 'string' && SERVICE_DOMAIN.length > 0, SERVICE_DOMAIN);
  ok('GOVERNING_LAW 非空', typeof GOVERNING_LAW === 'string' && GOVERNING_LAW.length > 0);
  ok('JURISDICTION_VENUE 非空', typeof JURISDICTION_VENUE === 'string' && JURISDICTION_VENUE.length > 0);
  ok(
    'REFUND_WINDOW_DAYS 为正整数',
    Number.isInteger(REFUND_WINDOW_DAYS) && REFUND_WINDOW_DAYS > 0,
    String(REFUND_WINDOW_DAYS)
  );
  ok(
    'GENERATION_HISTORY_LIMIT 为正整数',
    Number.isInteger(GENERATION_HISTORY_LIMIT) && GENERATION_HISTORY_LIMIT > 0,
    String(GENERATION_HISTORY_LIMIT)
  );
  ok(
    'LEGAL_EFFECTIVE_DATE 是合法日期',
    LEGAL_EFFECTIVE_DATE instanceof Date && !Number.isNaN(LEGAL_EFFECTIVE_DATE.getTime()),
    LEGAL_EFFECTIVE_DATE_TEXT
  );

  // 待办项只提示、不判失败 —— 这些是需要人工确认的事项，不是代码缺陷
  const pending = getPendingLegalTodos();
  console.log(
    pending.length === 0
      ? '✅ 法律配置无待确认项'
      : `⚠️  法律配置仍有 ${pending.length} 项待人工确认：\n   - ${pending.join('\n   - ')}`
  );

  // =====================================================
  console.log('\n--- 2. 隐私弹窗不得包含失实声明（7 种语言）---');

  // 历史 bug：文案声称「图片处理后不会存储在我们服务器上」「不会与第三方共享」，
  // 而代码实际会把原图入库、并把图片发送给 MiniMax。
  const falseClaims = [
    'will NOT be stored on our servers',
    'ne sera PAS stockée',
    'TIDAK akan disimpan',
    '保存されません',
    '저장되지 않습니다',
    'NO se almacenará',
    '不会存储在我们的服务器',
    'NOT be shared with third parties',
    'ne sera PAS partagée',
    'TIDAK akan dikongsi',
    '第三者と共有されません',
    '공유되지 않습니다',
    'NO se compartirá',
    '不会与第三方共享',
  ];
  const reIntroduce = falseClaims.filter((claim) => consentTexts.includes(claim));
  ok(
    '弹窗中不存在「不存储 / 不共享」这类失实表述',
    reIntroduce.length === 0,
    reIntroduce.length ? `重新引入了：${reIntroduce.join(' | ')}` : undefined
  );

  ok(
    '弹窗说明了图片会交给 AI 服务商处理',
    consentText.includes('AI provider') && consentText.includes('当社のAI提供事業者'),
    undefined
  );
  ok(
    '弹窗说明了只保留最近若干条生成记录',
    consentText.includes(`${GENERATION_HISTORY_LIMIT} most recent generations`),
    `期望出现文案包含 "${GENERATION_HISTORY_LIMIT} most recent generations"`
  );
  ok('弹窗给出了完整隐私政策的入口', consentModal.includes('href="/privacy"'));
  ok(
    '弹窗仍要求用户主动勾选同意（同意机制未被破坏）',
    consentModal.includes('consent-checkbox') && consentModal.includes('disabled={!isConsentChecked}')
  );

  // =====================================================
  console.log('\n--- 3. 隐私政策必须披露全部实际使用的第三方 ---');

  // 这些是代码里真实存在的服务商；新增服务商时必须同步更新隐私政策
  const requiredProcessors = ['Supabase', 'MiniMax', 'Dodo Payments', 'Vercel', 'Microsoft Clarity'];
  const missingProcessors = missing(privacyPage, requiredProcessors);
  ok(
    '隐私政策列出了全部服务商（Supabase / MiniMax / Dodo / Vercel / Clarity）',
    missingProcessors.length === 0,
    missingProcessors.length ? `缺少：${missingProcessors.join(', ')}` : undefined
  );

  ok(
    '说明了上传的照片会发送给 AI 服务商',
    privacyText.includes('forwarded to our AI processing provider') &&
      privacyText.includes('sent to our AI provider')
  );
  ok(
    '说明了只保留最近若干条生成记录',
    privacyPage.includes('most recent generations') && privacyPage.includes('GENERATION_HISTORY_LIMIT')
  );
  ok(
    '说明了用户可自行删除记录',
    privacyPage.includes('My Creations') && privacyPage.includes('#your-rights')
  );
  ok(
    '包含数据主体权利与联系方式',
    privacyPage.includes('SUPPORT_EMAIL') && privacyPage.includes('mailto:')
  );
  ok(
    '包含「不出售个人信息」声明（CCPA 等要求）',
    privacyPage.includes('do not sell your personal information')
  );
  ok(
    '隐私政策是服务端组件（否则预渲染 HTML 里没有内容，无法被抓取）',
    !privacyPage.trimStart().startsWith("'use client'")
  );

  // =====================================================
  console.log('\n--- 4. 服务条款的关键事实必须与产品行为一致 ---');

  ok(
    '声明为一次性购买、无订阅（与产品一致：只有一次性积分包）',
    termsText.includes('one-time purchases') && termsText.includes('no subscription')
  );
  ok(
    '声明积分永不过期（与价格页一致）',
    termsText.includes('never expire')
  );
  ok(
    '退款窗口来自配置，不在页面里硬编码',
    termsPage.includes('REFUND_WINDOW_DAYS')
  );
  ok(
    '声明生成失败不扣积分（与 app/api/generate/route.ts「仅在成功时扣减」一致）',
    termsText.includes('only deducted when a generation succeeds')
  );
  ok(
    '说明了 Dodo Payments 作为 merchant of record 的角色',
    termsText.includes('merchant of record')
  );
  ok(
    '包含可接受使用条款与 AI 结果免责声明',
    termsPage.includes('acceptable-use') && termsPage.includes('ai-output')
  );
  ok(
    '适用法律与管辖地来自配置',
    termsPage.includes('GOVERNING_LAW') && termsPage.includes('JURISDICTION_VENUE')
  );
  ok(
    '服务条款是服务端组件',
    !termsPage.trimStart().startsWith("'use client'")
  );

  // =====================================================
  console.log('\n--- 5. 法律页面可被发现（sitemap + 站内链接）---');

  ok(
    'sitemap 收录 /privacy/（带尾斜杠，符合 trailingSlash 约定）',
    sitemap.includes('/privacy/')
  );
  ok('sitemap 收录 /terms/', sitemap.includes('/terms/'));
  ok(
    '站内页脚提供法律信息入口（否则页面无从到达）',
    (() => {
      const footer = read('components/SiteFooter.tsx');
      return footer.includes('href="/privacy"') && footer.includes('href="/terms"');
    })()
  );
  ok(
    '页脚已挂载到根布局（每个页面都能到达法律信息）',
    read('app/layout.tsx').includes('<SiteFooter />')
  );
  ok(
    '两页互相引用（隐私政策 ↔ 服务条款）',
    privacyPage.includes('href="/terms"') && termsPage.includes('href="/privacy"')
  );

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

