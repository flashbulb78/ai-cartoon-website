/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行 tsc 编译出的 CommonJS 产物，必须使用 require */
/**
 * 安全工具模块回归测试
 * 覆盖：lib/imageValidation.ts、lib/hostAllowlist.ts、lib/requestLimits.ts
 *
 * 运行方式：bash scripts/verification/run.sh
 * （该脚本会先把上述 TS 模块编译成 JS，再执行本文件）
 *
 * 背景：这三个模块是「防止接口被滥用 / 被当作跳板」的关键防线，
 *       一旦被改坏会静默失效（校验失败即放行），因此必须能随时回归验证。
 */
const fs = require('fs');
const path = require('path');

const { validateImagePayload, sniffMimeTypeFromBase64 } = require('./imageValidation');
const { validateProxyTarget, isAllowedHostname, isBlockedHostname, getAllowedHosts } = require('./hostAllowlist');
const { readBodyWithLimit, exceedsContentLength } = require('./requestLimits');
const { getImageExtension } = require('./utils');
const { buildSoftwareApplicationSchema, serializeSchema } = require('./structuredData');

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

function readB64(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath)).toString('base64');
}

function checkImage(name, input, expectValid, expectErrorIncludes) {
  const r = validateImagePayload(input);
  const errorOk = !expectErrorIncludes || (r.error || '').includes(expectErrorIncludes);
  ok(
    name,
    r.valid === expectValid && errorOk,
    `valid=${r.valid} mime=${r.mimeType || '-'} size=${r.width || '?'}x${r.height || '?'}${r.error ? ` error="${r.error}"` : ''}`
  );
}

function checkProxy(name, input, expectOk, expectStatus) {
  const r = validateProxyTarget(input);
  ok(
    name,
    r.ok === expectOk && (expectOk === true || r.status === expectStatus),
    `${JSON.stringify(input)} → ${r.ok ? 'ALLOWED' : `BLOCKED(${r.status})`}`
  );
}

function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function main() {
  // =====================================================
  console.log('\n########## 一、图片校验（lib/imageValidation.ts）##########\n');
  // =====================================================
  console.log('--- 1.1 合法图片必须通过，且尺寸解析正确 ---');
  // 测试样本刻意使用「项目本身必须保留」的图片，避免为测试额外占用仓库体积：
  //   apple-touch-icon.png → 真实 PNG（180x180）
  //   samples/example.png  → 实为 JPEG（1024x1024），恰好也用于验证「按真实字节判定类型」
  checkImage('真实 PNG (apple-touch-icon.png)', readB64('public/apple-touch-icon.png'), true);
  checkImage('真实 PNG (logo_192.png)', readB64('public/logo_192.png'), true);
  checkImage('真实 JPEG (samples/example.png，实为 JPEG)', readB64('public/samples/example.png'), true);
  checkImage(
    'PNG + data URL 前缀（前端实际上送格式）',
    'data:image/png;base64,' + readB64('public/apple-touch-icon.png'),
    true
  );
  checkImage(
    'data URL 声明 png 但内容是 jpeg（不应误杀）',
    'data:image/png;base64,' + readB64('public/samples/example.png'),
    true
  );

  console.log('\n--- 1.2 非图片内容必须拒绝 ---');
  checkImage('纯文本内容', Buffer.from('definitely not an image').toString('base64'), false, 'Unsupported');
  checkImage(
    'ZIP 魔数内容',
    Buffer.from([0x50, 0x4b, 0x03, 0x04, ...new Array(200).fill(0)]).toString('base64'),
    false,
    'Unsupported'
  );

  console.log('\n--- 1.3 体积与分辨率边界 ---');
  checkImage(
    '1x1 PNG（分辨率过低）',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
    false,
    'too low'
  );

  const pngFixture = fs.readFileSync(path.join(ROOT, 'public/apple-touch-icon.png'));
  const oversized = Buffer.from(pngFixture);
  oversized.writeUInt32BE(99999, 16);
  oversized.writeUInt32BE(99999, 20);
  checkImage('PNG 尺寸 99999x99999（过高）', oversized.toString('base64'), false, 'too large');

  const tooSmall = Buffer.from(pngFixture);
  tooSmall.writeUInt32BE(50, 16);
  tooSmall.writeUInt32BE(50, 20);
  checkImage('PNG 尺寸 50x50（过低）', tooSmall.toString('base64'), false, 'too low');

  checkImage(
    '超大 payload（约 9MB > 8MB 上限）',
    readB64('public/apple-touch-icon.png') + 'A'.repeat(12 * 1024 * 1024),
    false,
    'too large'
  );

  console.log('\n--- 1.4 异常输入 ---');
  checkImage('空字符串', '', false);
  checkImage('null', null, false);
  checkImage('数字', 12345, false);
  checkImage('只有 data URL 前缀', 'data:image/png;base64,', false);

  console.log('\n--- 1.5 类型嗅探（用于修正 data URL 的 MIME 前缀）---');
  {
    const pngB64 = readB64('public/apple-touch-icon.png');
    const jpgB64 = readB64('public/samples/example.png');
    ok(
      'base64 嗅探 PNG',
      sniffMimeTypeFromBase64(pngB64) === 'image/png',
      `得到=${sniffMimeTypeFromBase64(pngB64)}`
    );
    ok(
      'base64 嗅探 JPEG',
      sniffMimeTypeFromBase64(jpgB64) === 'image/jpeg',
      `得到=${sniffMimeTypeFromBase64(jpgB64)}`
    );
    ok('base64 嗅探垃圾数据 → null', sniffMimeTypeFromBase64('QUJDREVGRw==') === null);
  }

  console.log('\n--- 1.6 下载扩展名推断（生成图实际是 JPEG，不能一律存成 .png）---');
  ok('data:image/jpeg → jpg', getImageExtension('data:image/jpeg;base64,AAAA') === 'jpg');
  ok('data:image/png → png', getImageExtension('data:image/png;base64,AAAA') === 'png');
  ok('data:image/webp → webp', getImageExtension('data:image/webp;base64,AAAA') === 'webp');
  ok('非 data URL → 默认 png', getImageExtension('https://example.com/a.bin') === 'png');
  ok('本地路径 → 默认 png', getImageExtension('/samples/example.png') === 'png');

  console.log('\n--- 1.7 结构化数据 JSON-LD（lib/structuredData.ts）---');
  {
    const pkgs = [
      { id: 'a', price: 4.99, currency: 'USD', credits: 40 },
      { id: 'b', price: 1.49, currency: 'USD', credits: 8 },
      { id: 'c', price: 8.99, currency: 'USD', credits: 100 },
    ];
    const schema = buildSoftwareApplicationSchema(pkgs);

    ok('@type 为 SoftwareApplication', schema['@type'] === 'SoftwareApplication');
    ok('offers 使用 AggregateOffer（而非单一 Offer）', schema.offers && schema.offers['@type'] === 'AggregateOffer');
    ok('lowPrice 自动取最小价', schema.offers && schema.offers.lowPrice === '1.49', `得到=${schema.offers && schema.offers.lowPrice}`);
    ok('highPrice 自动取最大价', schema.offers && schema.offers.highPrice === '8.99', `得到=${schema.offers && schema.offers.highPrice}`);
    ok('offerCount 等于套餐数量', schema.offers && schema.offers.offerCount === 3);
    ok('priceCurrency 取自套餐数据', schema.offers && schema.offers.priceCurrency === 'USD');
    ok('url 为站点首页绝对地址', schema.url === 'https://www.magicyoyoyo.com/', `得到=${schema.url}`);
    ok('刻意不含 aggregateRating（无真实评价不得编造）', !('aggregateRating' in schema));

    const emptySchema = buildSoftwareApplicationSchema([]);
    ok('无套餐时省略 offers（不编造价格）', !('offers' in emptySchema));

    ok(
      'serializeSchema 转义 < 以防 </script> 提前闭合',
      serializeSchema({ x: '</script>' }).indexOf('<') === -1
    );
    ok(
      'serializeSchema 输出仍可被 JSON.parse 还原',
      JSON.parse(serializeSchema(schema))['@type'] === 'SoftwareApplication'
    );
  }

  // =====================================================
  console.log('\n########## 二、代理白名单（lib/hostAllowlist.ts）##########\n');
  // =====================================================
  console.log('--- 2.1 应放行 ---');
  checkProxy('白名单子域', 'https://api.minimaxi.com/v1/image.png', true);
  checkProxy('白名单裸域', 'https://minimaxi.com/a.png', true);
  checkProxy('对象存储子域', 'https://bucket.oss-cn-hangzhou.aliyuncs.com/a.png', true);

  console.log('\n--- 2.2 应拒绝：伪装域名 ---');
  checkProxy('普通外部域名', 'https://evil.com/a.png', false, 403);
  checkProxy('后缀伪装', 'https://minimaxi.com.evil.com/a.png', false, 403);
  checkProxy('前缀伪装', 'https://xminimaxi.com/a.png', false, 403);
  checkProxy('仿冒 TLD', 'https://minimaxi.com.cn/a.png', false, 403);

  console.log('\n--- 2.3 应拒绝：协议与内网地址（SSRF 核心）---');
  checkProxy('http 协议', 'http://api.minimaxi.com/a.png', false, 400);
  checkProxy('data URL', 'data:image/png;base64,AAAA', false, 400);
  checkProxy('file 协议', 'file:///etc/passwd', false, 400);
  checkProxy('localhost', 'https://localhost/a.png', false, 403);
  checkProxy('回环 IP', 'https://127.0.0.1/a.png', false, 403);
  checkProxy('私网 IP', 'https://192.168.1.1/a.png', false, 403);
  checkProxy('云元数据 IP', 'https://169.254.169.254/latest/meta-data/', false, 403);
  checkProxy('IPv6 回环', 'https://[::1]/a.png', false, 403);
  checkProxy('内网域 *.internal', 'https://vault.internal/a.png', false, 403);

  console.log('\n--- 2.4 非法输入 ---');
  checkProxy('null', null, false, 400);
  checkProxy('空字符串', '', false, 400);
  checkProxy('非 URL', 'not-a-url', false, 400);

  console.log('\n--- 2.5 环境变量扩展白名单 ---');
  process.env.IMAGE_PROXY_ALLOWED_HOSTS = 'cdn.example.com';
  console.log(`   当前白名单: ${getAllowedHosts().join(', ')}`);
  checkProxy('扩展域', 'https://cdn.example.com/a.png', true);
  checkProxy('扩展域子域', 'https://static.cdn.example.com/a.png', true);
  checkProxy('未列出的域仍拒绝', 'https://other.example.com/a.png', false, 403);
  delete process.env.IMAGE_PROXY_ALLOWED_HOSTS;

  console.log('\n--- 2.6 辅助函数 ---');
  ok('isBlockedHostname(127.0.0.1) === true', isBlockedHostname('127.0.0.1') === true);
  ok('isBlockedHostname(minimaxi.com) === false', isBlockedHostname('minimaxi.com') === false);
  ok('isAllowedHostname(api.minimaxi.com) === true', isAllowedHostname('api.minimaxi.com') === true);
  ok('isAllowedHostname(evil.com) === false', isAllowedHostname('evil.com') === false);


  // =====================================================
  console.log('\n########## 三、流式限流读取（lib/requestLimits.ts）##########\n');
  // =====================================================
  const small = await readBodyWithLimit(streamOf([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]), 1024);
  ok('小数据正确拼接', !!small && small.length === 5 && small[0] === 1 && small[4] === 5, `length=${small?.length}`);

  const big = await readBodyWithLimit(streamOf([new Uint8Array(600), new Uint8Array(600)]), 1000);
  ok('超限返回 null', big === null);

  const exact = await readBodyWithLimit(streamOf([new Uint8Array(1000)]), 1000);
  ok('恰好等于上限应通过', !!exact && exact.length === 1000, `length=${exact?.length}`);

  const emptyBody = await readBodyWithLimit(null, 1000);
  ok('null body 返回空数组', !!emptyBody && emptyBody.length === 0);

  const emptyStream = await readBodyWithLimit(streamOf([]), 1000);
  ok('空流返回空数组', !!emptyStream && emptyStream.length === 0);

  console.log('\n--- 3.2 content-length 预检 ---');
  ok('声明 2000 > 1000 → true', exceedsContentLength(new Headers({ 'content-length': '2000' }), 1000) === true);
  ok('声明 500 ≤ 1000 → false', exceedsContentLength(new Headers({ 'content-length': '500' }), 1000) === false);
  ok('无 content-length → false（不误杀）', exceedsContentLength(new Headers({}), 1000) === false);
  ok('非法 content-length → false（不误杀）', exceedsContentLength(new Headers({ 'content-length': 'abc' }), 1000) === false);

  console.log('\n--- 3.3 超限时提前中断上游（防大文件 DoS）---');
  let cancelCalled = false;
  let produced = 0;
  const liveStream = new ReadableStream({
    pull(controller) {
      produced += 1;
      if (produced > 500) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(600));
    },
    cancel() {
      cancelCalled = true;
    },
  });
  const liveResult = await readBodyWithLimit(liveStream, 1000);
  ok(
    '超限即中断上游，不再继续拉取',
    liveResult === null && cancelCalled === true && produced < 10,
    `返回=${liveResult} 已生产块数=${produced} cancel调用=${cancelCalled}`
  );

  // =====================================================
  console.log(`\n########## 结果：${pass} 通过 / ${fail} 失败 ##########\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('测试执行异常:', error);
  process.exit(1);
});

