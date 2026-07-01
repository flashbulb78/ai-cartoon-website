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
 * 注意：此文件使用 Edge Runtime 完全兼容的 API，不依赖 Node.js 特定模块
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createBrowserClient } from '@supabase/ssr';

/**
 * 从请求头提取真实IP地址（Edge Runtime兼容）
 * 兼容 Vercel、Cloudflare 等多层代理环境
 */
function getClientIp(request: NextRequest): string | null {
  // 优先使用 CF-Connecting-IP（Cloudflare代理）
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return extractFirstIp(cfIp);

  // 使用 x-vercel-forwarded-for（Vercel代理）
  const vercelForwardedFor = request.headers.get('x-vercel-forwarded-for');
  if (vercelForwardedFor) return extractFirstIp(vercelForwardedFor);

  // 使用 x-forwarded-for（通用代理）
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return extractFirstIp(forwardedFor);

  // 使用 x-real-ip（nginx代理）
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return extractFirstIp(realIp);

  return null;
}

/**
 * 从逗号分隔的IP列表中提取第一个IP
 */
function extractFirstIp(ipString: string | null): string | null {
  if (!ipString) return null;
  
  const ips = ipString.split(',').map(ip => ip.trim());
  const firstIp = ips[0];
  
  // 过滤内网IP
  if (isPrivateIp(firstIp)) {
    if (ips.length > 1 && !isPrivateIp(ips[1])) {
      return ips[1];
    }
    return null;
  }
  
  return firstIp;
}

/**
 * 判断是否为内网IP地址
 */
function isPrivateIp(ip: string | null): boolean {
  if (!ip) return true;
  
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true;
  
  const [a, b] = parts;
  
  // 127.x.x.x (loopback)
  if (a === 127) return true;
  
  // 10.x.x.x
  if (a === 10) return true;
  
  // 172.16.x.x - 172.31.x.x
  if (a === 172 && b >= 16 && b <= 31) return true;
  
  // 192.168.x.x
  if (a === 192 && b === 168) return true;
  
  // 169.254.x.x (link-local)
  if (a === 169 && b === 254) return true;
  
  return false;
}

/**
 * 从User-Agent识别设备类型（Edge Runtime兼容）
 */
function getDeviceType(userAgent: string | null): 'PC' | 'Mobile' | 'Tablet' | 'Unknown' {
  if (!userAgent) return 'Unknown';
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('tablet') || ua.includes('ipad')) return 'Tablet';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'Mobile';
  if (ua.includes('bot') || ua.includes('crawler')) return 'Unknown';
  
  return 'PC';
}

/**
 * 解析地理位置（使用Vercel提供的国家代码，Edge Runtime兼容）
 */
function parseGeoLocation(countryCode: string | null): string {
  if (countryCode) {
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
  }
  
  return '未知';
}

export async function middleware(request: NextRequest) {
  // 异步执行日志记录，不阻塞请求
  processPageAccess(request).catch(err => {
    console.error('[Middleware] Page access log error:', err);
  });

  return NextResponse.next();
}

/**
 * 创建Supabase客户端（用于中间件）
 */
function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * 处理页面访问日志
 * 使用 Promise.allSettled 确保即使日志写入失败也不影响主流程
 */
async function processPageAccess(request: NextRequest): Promise<void> {
  try {
    const supabase = createSupabaseClient();
    
    // 获取用户会话
    const { data: { user } } = await supabase.auth.getUser();
    
    // 提取客户端信息（使用内联函数，Edge Runtime兼容）
    const clientIp = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || null;
    const deviceType = getDeviceType(userAgent);
    const countryCode = request.headers.get('x-vercel-ip-country') || null;
    const location = parseGeoLocation(countryCode);
    
    // 获取请求路径
    const pagePath = request.nextUrl.pathname;
    
    // 忽略静态资源路径
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
    const shouldIgnore = staticExtensions.some(ext => pagePath.endsWith(ext));
    if (shouldIgnore) return;
    
    // 忽略日志相关API路径，避免循环
    if (pagePath.startsWith('/api/admin/')) return;
    
    // 生成会话ID（如果用户已登录，使用用户ID作为会话标识）
    const sessionId = user?.id || `guest_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // 异步写入页面访问日志
    const logPromise = supabase
      .from('user_page_logs')
      .insert({
        user_id: user?.id || null,
        page_path: pagePath,
        access_ip: clientIp,
        access_at: new Date().toISOString(),
        user_agent: userAgent,
        device_type: deviceType,
        location: location,
        session_id: sessionId,
      });
    
    // 使用 Promise.allSettled 确保写入失败不影响主流程
    const results = await Promise.allSettled([logPromise]);
    
    // 只记录错误，不抛出异常
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[Middleware] Page log insert failed (promise ${index}):`, result.reason);
      }
    });

  } catch (error) {
    // 捕获所有异常，不影响请求处理
    console.error('[Middleware] Page access log error:', error);
  }
}

// 配置需要匹配的路径
export const config = {
  matcher: [
    // 匹配所有页面和API路由，除了静态资源和内部API
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
};
