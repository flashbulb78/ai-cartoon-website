/**
 * middleware.ts
 * 全局中间件 - 捕获所有页面/API请求的访问日志
 * 
 * 功能：
 * 1. 自动区分登录用户/游客
 * 2. 提取客户端真实IP（兼容Vercel多层代理，使用Edge原生API）
 * 3. 异步记录页面访问日志，不阻塞主流程
 * 4. 写入失败不抛出业务报错
 * 
 * 安全特性：
 * - 使用 @supabase/supabase-js（Edge兼容）而非 @supabase/ssr
 * - 多层 try/catch 容错
 * - 任何异常都不阻断页面访问
 * 
 * 注意：此文件使用 Edge Runtime 完全兼容的 API，不依赖 Node.js 特定模块
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 创建Supabase客户端（Edge兼容版本）
 * 使用 @supabase/supabase-js 而非 @supabase/ssr
 */
function createSupabaseClient(): SupabaseClient | null {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!url || !key) {
      console.warn('[Middleware] Supabase environment variables missing');
      return null;
    }
    
    return createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  } catch (err) {
    console.error('[Middleware] Failed to create Supabase client:', err);
    return null;
  }
}

/**
 * 从请求头提取真实IP地址（Edge Runtime兼容）
 * 兼容 Vercel、Cloudflare 等多层代理环境
 */
function getClientIp(request: NextRequest): string | null {
  try {
    const cfIp = request.headers.get('cf-connecting-ip');
    if (cfIp) return extractFirstIp(cfIp);

    const vercelForwardedFor = request.headers.get('x-vercel-forwarded-for');
    if (vercelForwardedFor) return extractFirstIp(vercelForwardedFor);

    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) return extractFirstIp(forwardedFor);

    const realIp = request.headers.get('x-real-ip');
    if (realIp) return extractFirstIp(realIp);
  } catch {
    // IP 读取失败，返回 null
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
 * 从User-Agent识别设备类型（Edge Runtime兼容）
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
 * 解析地理位置（使用Vercel提供的国家代码，Edge Runtime兼容）
 */
function parseGeoLocation(countryCode: string | null): string {
  if (countryCode) {
    try {
      const countryNames: Record<string, string> = {
        'US': '美国',
        'CN': '中国',
        'JP': '日本',
        'KR': '韩国',
        'GB': '英国',
        'DE': '德国',
        'FR': '法国',
        'IN': '印度',
        'BR': '巴西',
        'AU': '澳大利亚',
        'CA': '加拿大',
        'SG': '新加坡',
        'HK': '香港',
        'TW': '台湾',
      };
      return countryNames[countryCode.toUpperCase()] || countryCode.toUpperCase();
    } catch {
      return '未知';
    }
  }
  
  return '未知';
}

/**
 * 异步执行日志记录，不阻塞请求 - 带完整错误处理
 */
function processPageAccessSafe(request: NextRequest): void {
  Promise.resolve().then(() => {
    processPageAccess(request).catch(err => {
      console.error('[Middleware] Page access log error:', err);
    });
  }).catch(() => {
    // 静默处理
  });
}

/**
 * 处理页面访问日志
 * 多层容错：任何异常都不阻断页面访问
 */
async function processPageAccess(request: NextRequest): Promise<void> {
  try {
    const supabase = createSupabaseClient();
    
    if (!supabase) {
      return;
    }
    
    // 获取用户ID（直接从Cookie读取token，Edge兼容方式）
    // 不调用任何auth方法，避免__dirname错误
    let userId: string | null = null;
    try {
      const accessToken = tryGetCookie(request, 'sb-access-token');
      // 如果有token，解析JWT获取userId（不调用auth API）
      if (accessToken) {
        try {
          const payload = JSON.parse(atob(accessToken.split('.')[1]));
          userId = payload.sub || null;
        } catch {
          // JWT解析失败，忽略
        }
      }
    } catch (err) {
      console.error('[Middleware] Failed to get user ID:', err);
    }
    
    // 提取客户端信息
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
    
    // 忽略静态资源路径
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
    const shouldIgnore = staticExtensions.some(ext => pagePath.endsWith(ext));
    if (shouldIgnore) return;
    
    // 忽略日志相关API路径，避免循环
    if (pagePath.startsWith('/api/admin/')) return;
    
    // 生成会话ID
    let sessionId: string;
    try {
      sessionId = userId || `guest_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    } catch {
      sessionId = `guest_${Date.now()}_fallback`;
    }
    
    // 异步写入页面访问日志（独立 try/catch）
    try {
      const result = await supabase
        .from('user_page_logs')
        .insert({
          user_id: userId,
          page_path: pagePath,
          access_ip: clientIp,
          access_at: new Date().toISOString(),
          user_agent: userAgent,
          device_type: deviceType,
          location: location,
          session_id: sessionId,
        });
      
      if (result.error) {
        console.error('[Middleware] Log insert error:', result.error);
      }
    } catch (err) {
      console.error('[Middleware] Log insert exception:', err);
    }

  } catch (error) {
    console.error('[Middleware] processPageAccess error:', error);
  }
}

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
 * 全局中间件入口 - 多层容错
 */
export async function middleware(request: NextRequest) {
  try {
    processPageAccessSafe(request);
    return NextResponse.next();
  } catch (error) {
    console.error('[Middleware] Uncaught exception:', error);
    return NextResponse.next();
  }
}

// 配置需要匹配的路径
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
};
