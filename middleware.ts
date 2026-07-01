/**
 * middleware.ts
 * 全局中间件 - 捕获所有页面/API请求的访问日志
 * 
 * 功能：
 * 1. 自动区分登录用户/游客
 * 2. 提取客户端真实IP（兼容Vercel多层代理）
 * 3. 异步记录页面访问日志，不阻塞主流程
 * 
 * Edge Runtime 兼容实现：
 * - 不使用 @supabase/supabase-js（可能有 Node.js 全局变量）
 * - 直接使用原生 fetch 调用 Supabase REST API
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 安全获取请求头
 */
function tryGetHeader(request: NextRequest, name: string): string | null {
  try {
    return request.headers.get(name) || null;
  } catch {
    return null;
  }
}

/**
 * 安全获取Cookie
 */
function tryGetCookie(request: NextRequest, name: string): string | null {
  try {
    return request.cookies.get(name)?.value || null;
  } catch {
    return null;
  }
}

/**
 * 从请求头提取真实IP地址
 */
function getClientIp(request: NextRequest): string | null {
  try {
    const cfIp = tryGetHeader(request, 'cf-connecting-ip');
    if (cfIp) return extractFirstIp(cfIp);

    const vercelForwardedFor = tryGetHeader(request, 'x-vercel-forwarded-for');
    if (vercelForwardedFor) return extractFirstIp(vercelForwardedFor);

    const forwardedFor = tryGetHeader(request, 'x-forwarded-for');
    if (forwardedFor) return extractFirstIp(forwardedFor);

    const realIp = tryGetHeader(request, 'x-real-ip');
    if (realIp) return extractFirstIp(realIp);
  } catch {
    // IP 读取失败
  }
  return null;
}

/**
 * 从逗号分隔的IP列表中提取第一个IP
 */
function extractFirstIp(ipString: string | null): string | null {
  if (!ipString) return null;
  try {
    const ips = ipString.split(',').map(ip => ip.trim());
    const firstIp = ips[0];
    if (isPrivateIp(firstIp)) {
      if (ips.length > 1 && !isPrivateIp(ips[1])) {
        return ips[1];
      }
      return null;
    }
    return firstIp;
  } catch {
    return null;
  }
}

/**
 * 判断是否为内网IP地址
 */
function isPrivateIp(ip: string | null): boolean {
  if (!ip) return true;
  try {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return true;
    const [a, b] = parts;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  } catch {
    return true;
  }
  return false;
}

/**
 * 从User-Agent识别设备类型
 */
function getDeviceType(userAgent: string | null): 'PC' | 'Mobile' | 'Tablet' | 'Unknown' {
  if (!userAgent) return 'Unknown';
  try {
    const ua = userAgent.toLowerCase();
    if (ua.includes('tablet') || ua.includes('ipad')) return 'Tablet';
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'Mobile';
    if (ua.includes('bot') || ua.includes('crawler')) return 'Unknown';
  } catch {
    return 'Unknown';
  }
  return 'PC';
}

/**
 * 解析地理位置
 */
function parseGeoLocation(countryCode: string | null): string {
  if (countryCode) {
    try {
      const countryNames: Record<string, string> = {
        'US': '美国', 'CN': '中国', 'JP': '日本', 'KR': '韩国',
        'GB': '英国', 'DE': '德国', 'FR': '法国', 'IN': '印度',
        'BR': '巴西', 'AU': '澳大利亚', 'CA': '加拿大',
        'SG': '新加坡', 'HK': '香港', 'TW': '台湾',
      };
      return countryNames[countryCode.toUpperCase()] || countryCode.toUpperCase();
    } catch {
      return '未知';
    }
  }
  return '未知';
}

/**
 * 使用原生 fetch 写入 Supabase 日志（Edge 兼容）
 */
async function writePageLog(logData: {
  userId: string | null;
  pagePath: string;
  clientIp: string | null;
  userAgent: string | null;
  deviceType: string;
  location: string;
  sessionId: string;
}): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('[Middleware] Supabase env missing');
      return;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/user_page_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        user_id: logData.userId,
        page_path: logData.pagePath,
        access_ip: logData.clientIp,
        access_at: new Date().toISOString(),
        user_agent: logData.userAgent,
        device_type: logData.deviceType,
        location: logData.location,
        session_id: logData.sessionId,
      }),
    });

    if (!response.ok) {
      console.error('[Middleware] Log write failed:', response.status);
    }
  } catch (err) {
    console.error('[Middleware] Log write error:', err);
  }
}

/**
 * 异步执行日志记录
 */
function processPageAccessSafe(request: NextRequest): void {
  Promise.resolve().then(() => {
    processPageAccess(request).catch(err => {
      console.error('[Middleware] Page access error:', err);
    });
  }).catch(() => {});
}

/**
 * 处理页面访问日志
 */
async function processPageAccess(request: NextRequest): Promise<void> {
  try {
    // 获取用户ID（从JWT token解析，不调用auth API）
    let userId: string | null = null;
    try {
      const accessToken = tryGetCookie(request, 'sb-access-token');
      if (accessToken) {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        userId = payload.sub || null;
      }
    } catch (err) {
      console.error('[Middleware] JWT parse error:', err);
    }

    // 获取请求信息
    const clientIp = getClientIp(request);
    const userAgent = tryGetHeader(request, 'user-agent');
    const deviceType = getDeviceType(userAgent);
    const countryCode = tryGetHeader(request, 'x-vercel-ip-country');
    const location = parseGeoLocation(countryCode);

    // 获取请求路径
    let pagePath: string;
    try {
      pagePath = request.nextUrl.pathname;
    } catch {
      pagePath = '/';
    }

    // 忽略静态资源
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
    if (staticExtensions.some(ext => pagePath.endsWith(ext))) return;

    // 忽略日志API路径
    if (pagePath.startsWith('/api/admin/')) return;

    // 生成会话ID
    const sessionId = userId || `guest_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 写入日志
    await writePageLog({
      userId,
      pagePath,
      clientIp,
      userAgent,
      deviceType,
      location,
      sessionId,
    });

  } catch (error) {
    console.error('[Middleware] processPageAccess error:', error);
  }
}

/**
 * 全局中间件入口
 */
export async function middleware(request: NextRequest) {
  try {
    processPageAccessSafe(request);
    return NextResponse.next();
  } catch (error) {
    console.error('[Middleware] Uncaught error:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
