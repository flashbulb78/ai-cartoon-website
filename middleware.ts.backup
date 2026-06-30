/**
 * middleware.ts
 * 全局中间件 - 捕获所有页面/API请求的访问日志
 * 
 * 功能：
 * 1. 自动区分登录用户/游客
 * 2. 提取客户端真实IP（兼容Vercel多层代理）
 * 3. 异步记录页面访问日志，不阻塞主流程
 * 4. 写入失败不抛出业务报错
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createBrowserClient } from '@supabase/ssr';
import { getClientIp, getDeviceType, parseGeoLocation } from '@/lib/ip-parse';

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
    
    // 提取客户端信息
    const clientIp = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || null;
    const deviceType = getDeviceType(userAgent);
    const countryCode = request.headers.get('x-vercel-ip-country') || null;
    const location = parseGeoLocation(clientIp, countryCode);
    
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