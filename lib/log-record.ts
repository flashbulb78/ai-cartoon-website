/**
 * lib/log-record.ts
 * 统一日志写入函数
 * 登录、页面访问均可调用，自动区分游客/登录用户
 * 日志写入逻辑异步执行，不阻塞主流程
 */

import { createClient } from '@/lib/supabase/client';
import { getClientIp, getDeviceType, parseGeoLocation, generateSessionId } from './ip-parse';
import type { NextRequest } from 'next/server';

export type LoginType = 'email' | 'google' | 'github' | 'guest';

export interface LogRecordData {
  userId?: string | null;
  loginIp?: string | null;
  userAgent?: string | null;
  deviceType?: 'PC' | 'Mobile' | 'Tablet' | 'Unknown';
  location?: string;
  loginType: LoginType;
  sessionId?: string;
}

/**
 * 记录用户登录/访问日志
 * 异步执行，不阻塞调用方
 * 
 * @param request Next.js 请求对象（用于提取IP、UA等）
 * @param userId 用户ID（未登录时为null）
 * @param loginType 登录方式
 * @param sessionId 会话ID
 */
export async function recordLoginLog(
  request: NextRequest,
  userId: string | null,
  loginType: LoginType,
  sessionId?: string
): Promise<void> {
  // 异步执行，不等待完成
  setImmediate(async () => {
    try {
      const supabase = createClient();
      
      // 提取客户端信息
      const clientIp = getClientIp(request);
      const userAgent = request.headers.get('user-agent');
      const deviceType = getDeviceType(userAgent);
      const countryCode = request.headers.get('x-vercel-ip-country');
      const location = parseGeoLocation(clientIp, countryCode);
      
      const finalSessionId = sessionId || generateSessionId();
      
      // 写入登录日志
      const { error: logError } = await supabase
        .from('user_login_logs')
        .insert({
          user_id: userId,
          login_ip: clientIp,
          login_at: new Date().toISOString(),
          user_agent: userAgent,
          device_type: deviceType,
          location: location,
          login_type: loginType,
          session_id: finalSessionId,
        });
      
      if (logError) {
        console.error('[LogRecord] Failed to write login log:', logError);
      }
      
      // 更新用户统计（如果已登录）
      if (userId) {
        await updateUserStats(userId, clientIp);
      }
    } catch (error) {
      console.error('[LogRecord] Error recording login log:', error);
    }
  });
}

/**
 * 更新用户访问统计
 */
async function updateUserStats(userId: string, clientIp: string | null): Promise<void> {
  try {
    const supabase = createClient();
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // 查询现有统计
    const { data: existingStats, error: queryError } = await supabase
      .from('user_access_stats')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (queryError && queryError.code !== 'PGRST116') {
      // 不是"没有找到记录"的错误
      console.error('[LogRecord] Failed to query user stats:', queryError);
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
      
      const { error: updateError } = await supabase
        .from('user_access_stats')
        .update(updates)
        .eq('user_id', userId);
      
      if (updateError) {
        console.error('[LogRecord] Failed to update user stats:', updateError);
      }
    } else {
      // 创建新统计记录
      const { error: insertError } = await supabase
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
      
      if (insertError) {
        console.error('[LogRecord] Failed to create user stats:', insertError);
      }
    }
  } catch (error) {
    console.error('[LogRecord] Error updating user stats:', error);
  }
}

/**
 * 记录页面访问（异步，不阻塞）
 * 
 * @param request Next.js 请求对象
 * @param pagePath 访问的页面路径
 * @param userId 用户ID（未登录时为null）
 */
export async function recordPageAccess(
  request: NextRequest,
  pagePath: string,
  userId: string | null
): Promise<void> {
  // 异步执行，不等待完成
  setImmediate(async () => {
    try {
      const supabase = createClient();
      
      const clientIp = getClientIp(request);
      const userAgent = request.headers.get('user-agent');
      const deviceType = getDeviceType(userAgent);
      const countryCode = request.headers.get('x-vercel-ip-country');
      const location = parseGeoLocation(clientIp, countryCode);
      
      // 写入页面访问日志
      const { error } = await supabase
        .from('user_page_logs')
        .insert({
          user_id: userId,
          page_path: pagePath,
          access_ip: clientIp,
          access_at: new Date().toISOString(),
          user_agent: userAgent,
          device_type: deviceType,
          location: location,
        });
      
      if (error) {
        console.error('[LogRecord] Failed to write page access log:', error);
      }
      
      // 更新用户的页面访问统计
      if (userId) {
        await incrementPageViews(userId);
      }
    } catch (error) {
      console.error('[LogRecord] Error recording page access:', error);
    }
  });
}

/**
 * 增加用户页面访问计数
 */
async function incrementPageViews(userId: string): Promise<void> {
  try {
    const supabase = createClient();
    
    const { error } = await supabase.rpc('increment_page_views', {
      user_id_param: userId,
    });
    
    if (error) {
      console.error('[LogRecord] Failed to increment page views:', error);
    }
  } catch (error) {
    console.error('[LogRecord] Error incrementing page views:', error);
  }
}

/**
 * 创建数据库需要的 RPC 函数（需要手动在数据库执行）
 * 
 * SQL:
 * CREATE OR REPLACE FUNCTION increment_page_views(user_id_param UUID)
 * RETURNS void AS $$
 * BEGIN
 *   UPDATE user_access_stats
 *   SET total_page_views = COALESCE(total_page_views, 0) + 1,
 *       update_at = NOW()
 *   WHERE user_id = user_id_param;
 * END;
 * $$ LANGUAGE plpgsql SECURITY DEFINER;
 */