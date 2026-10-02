/**
 * app/api/image-proxy/route.ts
 * 受控的图片代理接口 —— 解决 Canvas 跨域污染问题
 *
 * 远程图片直接加载进 Canvas 会触发 tainted canvas 导致无法导出，
 * 因此需要由一个「同源」接口中转图片资源。
 *
 * 安全约束（本接口本质是"帮你访问外部地址"，因此必须严格收口）：
 *   1. 必须登录             —— 只服务于已登录用户的生成/下载流程
 *   2. 限流                 —— 防止被当作免费代理刷流量
 *   3. 域名白名单           —— 只允许访问已知的图片来源域名，阻断 SSRF
 *   4. 仅允许 https         —— 杜绝内网 http 地址
 *   5. 禁止跟随重定向       —— 防止用"白名单域名 302 到内网地址"绕过白名单
 *   6. 仅接受图片响应       —— 非 image/* 一律拒绝
 *   7. 体积上限（流式计数） —— 避免大文件被打进内存（DoS）
 *   8. 不下发通配 CORS      —— 只允许本站使用（同源 <img> 无需 CORS 头）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRateLimiter, RATE_LIMITS } from '@/lib/rateLimit';
import { readBodyWithLimit, exceedsContentLength } from '@/lib/requestLimits';
import { validateProxyTarget } from '@/lib/hostAllowlist';

/** 单个响应体上限：10MB */
const MAX_PROXY_BYTES = 10 * 1024 * 1024;

/** 上游请求超时：10 秒 */
const FETCH_TIMEOUT_MS = 10_000;

// 目标地址白名单与安全校验逻辑已抽离到 lib/hostAllowlist.ts（便于独立测试）

export async function GET(request: NextRequest) {
  // ---------- 1. 限流 ----------
  const checkRateLimit = createRateLimiter(RATE_LIMITS.imageProxy, 'image-proxy');
  const rateLimitResponse = await checkRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // ---------- 2. 登录校验 ----------
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ---------- 3. 参数与地址校验（仅 https + 白名单 + 拒绝 IP/内网）----------
  const targetResult = validateProxyTarget(request.nextUrl.searchParams.get('url'));

  if (!targetResult.ok) {
    if (targetResult.status === 403) {
      console.warn('[ImageProxy] Blocked target:', request.nextUrl.searchParams.get('url'));
    }
    return NextResponse.json({ error: targetResult.error }, { status: targetResult.status });
  }

  const target = targetResult.url;

  // ---------- 4. 拉取上游图片 ----------
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'MagicCartoonAvatar/1.0' },
      // 禁止跟随重定向：否则白名单域名可通过 302 指向内网地址绕过校验
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (error) {
    console.error('[ImageProxy] Fetch failed:', error);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    console.warn('[ImageProxy] Redirect rejected:', target.hostname, upstream.status);
    return NextResponse.json({ error: 'Redirects are not allowed' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Failed to fetch image: ${upstream.status}` },
      { status: 502 }
    );
  }

  // ---------- 5. 只接受图片类型 ----------
  const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    console.warn('[ImageProxy] Non-image content-type:', contentType);
    return NextResponse.json({ error: 'Upstream content is not an image' }, { status: 415 });
  }

  // ---------- 6. 体积上限（先看声明，再流式计数兜底）----------
  if (exceedsContentLength(upstream.headers, MAX_PROXY_BYTES)) {
    return NextResponse.json({ error: 'Image too large' }, { status: 413 });
  }

  const bytes = await readBodyWithLimit(upstream.body, MAX_PROXY_BYTES);
  if (!bytes) {
    return NextResponse.json({ error: 'Image too large' }, { status: 413 });
  }

  // ---------- 7. 返回（同源使用，无需通配 CORS）----------
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType.split(';')[0],
      'Content-Length': String(bytes.byteLength),
      // 已按用户鉴权，故为 private；缓存 1 小时即可，不再长期 immutable 缓存
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
