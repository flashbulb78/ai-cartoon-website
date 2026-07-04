/**
 * app/api/auth/callback/route.ts
 * OAuth/邮箱登录回调服务端接口
 * 
 * 功能：
 * 1. 处理 Supabase 认证回调（OAuth code 交换）
 * 2. 服务端自动获取真实 IP（解决客户端无法获取 Request 的问题）
 * 3. 异步写入 user_login_logs 登录日志
 * 4. 异步更新 user_access_stats 统计表
 * 
 * 注意：此接口在服务端执行，可以获取真实的请求头信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getClientIp, getDeviceType, parseGeoLocation } from '@/lib/ip-parse';
import { createRateLimiter, RATE_LIMITS } from '@/lib/rateLimit';

/**
 * 检查用户是否为管理员
 */
async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .single();
  
  return !error && !!data;
}

/**
 * 记录用户登录日志（异步，不阻塞响应）
 */
async function recordLogin(userId: string, request: NextRequest, loginType: string): Promise<void> {
  try {
    const supabase = await createClient();
    
    // 提取客户端信息
    const clientIp = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || null;
    const deviceType = getDeviceType(userAgent);
    const countryCode = request.headers.get('x-vercel-ip-country') || null;
    const location = parseGeoLocation(clientIp, countryCode);
    
    // 生成会话ID
    const sessionId = `${userId}_${Date.now()}`;
    
    // 使用 Promise.allSettled 确保写入失败不影响登录流程
    const results = await Promise.allSettled([
      // 1. 写入登录日志
      supabase.from('user_login_logs').insert({
        user_id: userId,
        login_ip: clientIp,
        login_at: new Date().toISOString(),
        user_agent: userAgent,
        device_type: deviceType,
        location: location,
        login_type: loginType,
        session_id: sessionId,
      }),
      
      // 2. 更新用户访问统计
      updateUserAccessStats(userId, clientIp, supabase),
    ]);
    
    // 记录写入结果（不抛出异常）
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[AuthCallback] Login log ${index} failed:`, result.reason);
      }
    });
    
  } catch (error) {
    // 捕获所有异常，不影响登录流程
    console.error('[AuthCallback] Record login error:', error);
  }
}

/**
 * 更新用户访问统计
 * 仅登录用户更新，游客不生成统计行
 */
async function updateUserAccessStats(
  userId: string, 
  clientIp: string | null,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // 查询现有统计
    const { data: existingStats, error: queryError } = await supabase
      .from('user_access_stats')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (queryError && queryError.code !== 'PGRST116') {
      console.error('[AuthCallback] Query stats error:', queryError);
      return;
    }
    
    if (existingStats) {
      // 更新现有统计
      const isToday = existingStats.last_login_at && 
        existingStats.last_login_at.startsWith(today);
      
      const updates: Record<string, unknown> = {
        last_login_at: now.toISOString(),
        last_ip: clientIp,
        update_at: now.toISOString(),
      };
      
      // 如果不是今天登录，重置每日计数
      if (!isToday) {
        updates.daily_login_count = 1;
        updates.total_login_count = (existingStats.total_login_count || 0) + 1;
      } else {
        updates.daily_login_count = (existingStats.daily_login_count || 0) + 1;
        updates.total_login_count = (existingStats.total_login_count || 0) + 1;
      }
      
      await supabase
        .from('user_access_stats')
        .update(updates)
        .eq('user_id', userId);
      
    } else {
      // 创建新统计记录
      await supabase
        .from('user_access_stats')
        .insert({
          user_id: userId,
          total_login_count: 1,
          daily_login_count: 1,
          last_login_at: now.toISOString(),
          first_login_at: now.toISOString(),
          last_ip: clientIp,
          total_page_views: 0,
          update_at: now.toISOString(),
        });
    }
  } catch (error) {
    console.error('[AuthCallback] Update stats error:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 获取URL参数
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    
    // 如果有错误参数
    if (errorParam) {
      console.error('[AuthCallback] Auth error:', errorParam);
      return NextResponse.redirect(new URL('/auth/login?error=auth_failed', request.url));
    }
    
    // 如果没有 code，返回错误
    if (!code) {
      return NextResponse.redirect(new URL('/auth/login?error=missing_code', request.url));
    }
    
    // 交换 code 获取 session
    const { data: authData, error: authError } = await supabase.auth.exchangeCodeForSession(code);
    
    if (authError || !authData.user) {
      console.error('[AuthCallback] Exchange code error:', authError);
      return NextResponse.redirect(new URL('/auth/login?error=exchange_failed', request.url));
    }
    
    const userId = authData.user.id;
    const userEmail = authData.user.email;
    
    // 确定登录类型
    let loginType = 'email';
    if (state?.includes('google')) {
      loginType = 'google';
    } else if (state?.includes('github')) {
      loginType = 'github';
    }
    
    // 异步记录登录日志（不阻塞响应）
    recordLogin(userId, request, loginType).catch(err => {
      console.error('[AuthCallback] Failed to record login:', err);
    });
    
    console.log('[AuthCallback] User logged in:', userEmail, 'type:', loginType);
    
    // 成功，跳转回首页
    return NextResponse.redirect(new URL('/', request.url));
    
  } catch (error) {
    console.error('[AuthCallback] Unexpected error:', error);
    return NextResponse.redirect(new URL('/auth/login?error=server_error', request.url));
  }
}

export async function POST(request: NextRequest) {
  // 支持 POST 请求（用于邮箱密码登录的日志记录）
  // 邮箱登录通过 AuthContext 客户端处理，但可以通过此接口补录日志
  
  // ========== Rate Limiting 检查 ==========
  const checkRateLimit = createRateLimiter(RATE_LIMITS.auth);
  const rateLimitResponse = await checkRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // 使用 @supabase/ssr 创建的客户端，自动获取认证信息
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    
    // 从请求体获取登录类型
    const body = await request.json().catch(() => ({}));
    const loginType = body.loginType || 'email';
    
    // 异步记录登录日志
    recordLogin(user.id, request, loginType).catch(err => {
      console.error('[AuthCallback] POST failed to record login:', err);
    });
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('[AuthCallback] POST error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}