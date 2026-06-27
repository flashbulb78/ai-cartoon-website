/**
 * app/api/admin/login-logs/route.ts
 * GET /api/admin/login-logs
 * 管理员日志查询接口
 * 支持分页、传参startTime、endTime、userId、ip关键词筛选
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { getClientIp } from '@/lib/ip-parse';

/**
 * 检查用户是否为管理员
 */
async function isAdmin(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  // 使用 service role client 来检查管理员权限
  const { data, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .single();
  
  return !error && !!data;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // 1. 验证用户认证
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // 2. 检查管理员权限
    const isUserAdmin = await isAdmin(supabase, user.id);
    if (!isUserAdmin) {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }
    
    // 3. 解析查询参数
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const userIdFilter = searchParams.get('userId');
    const ipKeyword = searchParams.get('ip');
    const loginType = searchParams.get('loginType');
    
    // 4. 构建查询
    let query = supabase
      .from('user_login_logs')
      .select('*', { count: 'exact' });
    
    // 时间范围筛选
    if (startTime) {
      query = query.gte('login_at', startTime);
    }
    if (endTime) {
      query = query.lte('login_at', endTime);
    }
    
    // 用户ID筛选
    if (userIdFilter) {
      query = query.eq('user_id', userIdFilter);
    }
    
    // IP关键词筛选
    if (ipKeyword) {
      query = query.like('login_ip', `%${ipKeyword}%`);
    }
    
    // 登录类型筛选
    if (loginType) {
      query = query.eq('login_type', loginType);
    }
    
    // 5. 执行分页查询
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    const { data: logs, error: logsError, count } = await query
      .order('login_at', { ascending: false })
      .range(from, to);
    
    if (logsError) {
      console.error('[LoginLogs API] Query error:', logsError);
      return NextResponse.json(
        { success: false, error: 'Failed to query logs' },
        { status: 500 }
      );
    }
    
    // 6. 获取关联的用户信息（邮箱）
    const userIds = [...new Set(logs?.map(log => log.user_id).filter(Boolean) || [])];
    let userEmails: Record<string, string> = {};
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);
      
      userEmails = (profiles || []).reduce((acc, profile) => {
        acc[profile.id] = profile.email || 'Unknown';
        return acc;
      }, {} as Record<string, string>);
    }
    
    // 7. 返回结果
    return NextResponse.json({
      success: true,
      data: {
        logs: logs?.map(log => ({
          ...log,
          user_email: log.user_id ? userEmails[log.user_id] : 'Guest',
        })),
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        },
      },
    });
    
  } catch (error) {
    console.error('[LoginLogs API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}