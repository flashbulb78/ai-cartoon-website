/**
 * lib/rateLimit.ts
 * 简单的内存-based Rate Limiting 中间件
 * 用于防止 API 滥用和 DDoS 攻击
 * 
 * 注意：在 Vercel Serverless 环境中，内存会重置
 * 生产环境建议使用 Vercel KV 或 Redis
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  /** 窗口大小（毫秒） */
  windowMs: number;
  /** 最大请求数 */
  max: number;
  /** 限流后的错误消息 */
  message?: string;
}

// 内存存储（生产环境应使用 Redis/KV）
const rateLimitStore = new Map<string, RateLimitEntry>();

// 清理过期条目（每分钟执行一次）
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60 * 1000;

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
  lastCleanup = now;
}

/**
 * 获取客户端标识符
 * 优先使用 X-Forwarded-For（Vercel会提供）
 * 否则使用 request.headers.get('x-real-ip')
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
  
  // Fallback：使用 User-Agent 作为辅助标识
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  return `unknown:${userAgent.slice(0, 50)}`;
}

/**
 * Rate Limiter 配置预设
 */
export const RATE_LIMITS = {
  // 通用 API 限制：60请求/分钟
  api: {
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many requests. Please try again later.',
  },
  
  // 生成 API 限制：10请求/分钟（防止刷积分）
  generate: {
    windowMs: 60 * 1000,
    max: 10,
    message: 'Generation rate limit exceeded. Please wait before trying again.',
  },
  
  // 认证 API 限制：5请求/分钟（防止暴力破解）
  auth: {
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many authentication attempts. Please try again later.',
  },
  
  // 支付 API 限制：20请求/分钟
  payment: {
    windowMs: 60 * 1000,
    max: 20,
    message: 'Payment API rate limit exceeded.',
  },
} as const;

/**
 * 创建 Rate Limiting 检查函数
 * 
 * @param config Rate Limiter 配置
 * @returns 检查函数，调用后返回 Response 或 null
 */
export function createRateLimiter(config: RateLimitConfig) {
  return function checkRateLimit(request: Request): Response | null {
    // 清理过期条目
    cleanupExpiredEntries();
    
    const identifier = getClientIdentifier(request);
    const now = Date.now();
    const key = `ratelimit:${identifier}`;
    
    let entry = rateLimitStore.get(key);
    
    // 如果没有记录或已过期，创建新记录
    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
      };
      rateLimitStore.set(key, entry);
    }
    
    // 增加计数
    entry.count++;
    
    // 计算剩余时间
    const remaining = Math.max(0, config.max - entry.count);
    const resetIn = Math.ceil((entry.resetTime - now) / 1000);
    
    // 创建响应头
    const headers = new Headers({
      'X-RateLimit-Limit': String(config.max),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
    });
    
    // 如果超出限制，返回 429
    if (entry.count > config.max) {
      console.log(`[RateLimit] Rate limit exceeded for ${identifier}: ${entry.count}/${config.max}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: config.message || 'Too many requests',
          retryAfter: resetIn,
        }),
        {
          status: 429,
          headers: {
            ...Object.fromEntries(headers),
            'Content-Type': 'application/json',
            'Retry-After': String(resetIn),
          },
        }
      );
    }
    
    // 未超出限制，添加 headers 到请求（通过返回 null 表示通过）
    // 注意：在 Next.js API Route 中需要手动添加这些 headers
    return null;
  };
}

/**
 * 获取当前 Rate Limit 状态（用于调试）
 */
export function getRateLimitStatus(identifier: string) {
  const key = `ratelimit:${identifier}`;
  const entry = rateLimitStore.get(key);
  const now = Date.now();
  
  if (!entry || entry.resetTime < now) {
    return { remaining: 0, resetIn: 0, exceeded: false };
  }
  
  return {
    remaining: Math.max(0, 60 - entry.count),
    resetIn: Math.ceil((entry.resetTime - now) / 1000),
    exceeded: entry.count > 60,
  };
}
