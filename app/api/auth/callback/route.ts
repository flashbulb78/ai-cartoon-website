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
import { classifyAuthError } from '@/lib/authErrors';

/**
 * 允许记录的登录方式（对应 user_login_logs.login_type 的约定取值）
 * 该值来自请求体，会被写入日志并在后台展示，因此必须做白名单校验。
 */
const ALLOWED_LOGIN_TYPES: readonly string[] = ['email', 'google', 'github', 'guest'];

/**
 * 记录用户登录日志（内部吞掉全部异常，因此绝不会阻塞登录流程）
 *
 * 调用方应 `await` 本函数：在 Serverless 环境下，响应返回后运行环境可能立即冻结，
 * 游离（未被 await）的 Promise 会被静默丢弃，导致日志缺失且难以察觉。
 *
 * 安全说明：user_login_logs 的写入策略已收紧为仅 service_role 可用，
 * 因此这里必须使用 admin client（服务端可信通道）写入。
 * 调用前已通过 getUser() 校验用户身份，不会写入伪造数据。
 */
async function recordLogin(userId: string, request: NextRequest, loginType: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    
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
  supabase: ReturnType<typeof createAdminClient>
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
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // 如果有错误参数：先归一化成受控错误码，再重定向
    // （重定向 URL 中只允许出现我们自己定义的错误码，不回显 Supabase 返回的原文）
    if (errorParam || errorDescription) {
      const errorCode = classifyAuthError(errorParam, errorDescription);
      console.error('[AuthCallback] Auth error:', errorParam, '-', errorDescription);
      return NextResponse.redirect(
        new URL(`/auth/login?error=${errorCode}`, request.url)
      );
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
    
    // 确定登录方式
    // 注意：不能用 state 判断 —— Supabase 的 state 是随机串，不含 provider 名称，
    //       旧写法会把所有 Google 登录都错误地记成 email。
    //       正确来源是 user.app_metadata.provider（google / email / github …）。
    const provider = authData.user.app_metadata?.provider;
    const loginType = typeof provider === 'string' && provider ? provider : 'email';

    // 记录登录日志（必须 await）
    // 说明：此前是「不阻塞响应」的游离 Promise，但在 Serverless 环境下响应返回后
    //       运行环境可能立即冻结，写入会被静默丢弃 —— 日志缺失属于难以察觉的问题。
    //       recordLogin 内部已有 try/catch + Promise.allSettled，失败不会影响登录流程，
    //       因此这里可以安全地 await。
    await recordLogin(userId, request, loginType);
    
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
  const checkRateLimit = createRateLimiter(RATE_LIMITS.auth, 'auth');
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
    
    // 从请求体获取登录类型（白名单校验：该值会写入日志并在后台展示）
    const body = await request.json().catch(() => ({}));
    const rawLoginType = typeof body?.loginType === 'string' ? body.loginType : 'email';
    const loginType = ALLOWED_LOGIN_TYPES.includes(rawLoginType) ? rawLoginType : 'email';

    // 记录登录日志（同样必须 await，原因见 GET 中的说明）
    await recordLogin(user.id, request, loginType);
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('[AuthCallback] POST error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}