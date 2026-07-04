/**
 * lib/rateLimit.ts
 * 基于数据库的分布式限流中间件
 * 
 * 问题：Serverless环境下内存Map会重置，导致限流失效
 * 解决方案：使用Supabase数据库存储限流计数器，确保多实例共享
 */

import { createAdminClient } from './supabase/server';

/**
 * 限流配置
 */
interface RateLimitConfig {
  /** 窗口大小（秒） */
  windowSeconds: number;
  /** 最大请求数 */
  maxRequests: number;
  /** 限流后的错误消息 */
  message?: string;
}

/**
 * 限流结果
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  error?: string;
}

/**
 * Rate Limiter 配置预设
 */
export const RATE_LIMITS = {
  // 通用 API 限制：60请求/分钟
  api: {
    windowSeconds: 60,
    maxRequests: 60,
    message: 'Too many requests. Please try again later.',
  },
  
  // 生成 API 限制：10请求/分钟（防止刷积分）
  generate: {
    windowSeconds: 60,
    maxRequests: 10,
    message: 'Generation rate limit exceeded. Please wait before trying again.',
  },
  
  // 认证 API 限制：5请求/分钟（防止暴力破解）
  auth: {
    windowSeconds: 60,
    maxRequests: 5,
    message: 'Too many authentication attempts. Please try again later.',
  },
  
  // 支付 API 限制：20请求/分钟
  payment: {
    windowSeconds: 60,
    maxRequests: 20,
    message: 'Payment API rate limit exceeded.',
  },
} as const;

/**
 * 获取客户端标识符（IP）
 */
function getClientIdentifier(request: Request): string {
  // Vercel 会设置 x-forwarded-for
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  // Vercel Edge 或其他平台
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  
  // Fallback
  return 'unknown';
}

/**
 * 创建基于数据库的限流检查函数
 * 
 * @param config 限流配置
 * @param action 限流动作名称（用于区分不同类型的限流）
 * @returns 检查函数，调用后返回 RateLimitResult
 */
export function createDatabaseRateLimiter(config: RateLimitConfig, action: string) {
  return async function checkRateLimit(request: Request): Promise<RateLimitResult> {
    const identifier = getClientIdentifier(request);
    
    try {
      const supabaseAdmin = createAdminClient();
      
      // 调用数据库函数检查限流
      const { data, error } = await supabaseAdmin
        .rpc('check_rate_limit', {
          p_identifier: identifier,
          p_action: action,
          p_max_requests: config.maxRequests,
          p_window_seconds: config.windowSeconds,
        })
        .single();
      
      if (error) {
        console.error('[RateLimit] Database error:', error);
        // 数据库出错时默认允许通过（避免影响正常业务）
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetInSeconds: config.windowSeconds,
        };
      }
      
      if (!data) {
        console.error('[RateLimit] No data returned from rate limit function');
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetInSeconds: config.windowSeconds,
        };
      }
      
      // data 是数组，需要取第一个元素
      const result = Array.isArray(data) ? data[0] : data;
      
      return {
        allowed: result.allowed,
        remaining: result.remaining,
        resetInSeconds: result.reset_in_seconds,
      };
    } catch (error) {
      console.error('[RateLimit] Exception:', error);
      // 出错时默认允许通过
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetInSeconds: config.windowSeconds,
      };
    }
  };
}

/**
 * 兼容性包装器 - 将数据库限流结果转换为 Response 或 null
 */
export function createRateLimiter(config: RateLimitConfig, action: string = 'api') {
  const dbLimiter = createDatabaseRateLimiter(config, action);
  
  return async function checkRateLimit(request: Request): Promise<Response | null> {
    const result = await dbLimiter(request);
    
    if (result.allowed) {
      return null; // 通过检查
    }
    
    // 创建限流响应
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Retry-After': String(result.resetInSeconds),
      'X-RateLimit-Limit': String(config.maxRequests),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + result.resetInSeconds),
    });
    
    console.log(`[RateLimit] Rate limit exceeded for action ${action}: ${config.maxRequests}/${config.windowSeconds}s`);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: config.message || 'Too many requests',
        retryAfter: result.resetInSeconds,
      }),
      {
        status: 429,
        headers,
      }
    );
  };
}

/**
 * 获取当前限流状态（用于调试）
 * 注意：在Serverless环境中此函数返回的是单实例状态，不够准确
 */
export async function getRateLimitStatus(identifier: string, action: string) {
  try {
    const supabaseAdmin = createAdminClient();
    
    const { data, error } = await supabaseAdmin
      .from('rate_limits')
      .select('count, window_start')
      .eq('identifier', identifier)
      .eq('action', action)
      .single();
    
    if (error || !data) {
      return { remaining: 0, resetIn: 0, exceeded: false };
    }
    
    const now = new Date();
    const windowStart = new Date(data.window_start);
    const resetIn = Math.max(0, Math.ceil((windowStart.getTime() + 60000 - now.getTime()) / 1000));
    
    return {
      remaining: Math.max(0, 60 - data.count),
      resetIn,
      exceeded: data.count >= 60,
    };
  } catch (error) {
    console.error('[RateLimit] Error getting status:', error);
    return { remaining: 0, resetIn: 0, exceeded: false };
  }
}

/**
 * 清理过期的限流记录（可由cronjob定期调用）
 */
export async function cleanupExpiredRateLimits(maxAgeHours: number = 24): Promise<number> {
  try {
    const supabaseAdmin = createAdminClient();
    
    const { data, error } = await supabaseAdmin
      .rpc('cleanup_expired_rate_limits', { p_max_age_hours: maxAgeHours });
    
    if (error) {
      console.error('[RateLimit] Cleanup error:', error);
      return 0;
    }
    
    return data || 0;
  } catch (error) {
    console.error('[RateLimit] Cleanup exception:', error);
    return 0;
  }
}
