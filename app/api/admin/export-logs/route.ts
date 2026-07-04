/**
 * app/api/admin/export-logs/route.ts
 * GET /api/admin/export-logs
 * 日志CSV导出接口
 * 支持导出指定时间范围内的登录日志
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

interface LoginLogRecord {
  id: string;
  user_id: string | null;
  login_ip: string | null;
  login_at: string;
  device_type: string | null;
  login_type: string;
  location: string | null;
  user_agent: string | null;
  session_id: string | null;
}

/**
 * 检查用户是否为管理员
 */
async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .single();
  
  return !error && !!data;
}

/**
 * 将日志数据转换为CSV格式
 */
function convertToCSV(logs: LoginLogRecord[], userEmails: Record<string, string>): string {
  const headers = [
    'ID',
    '用户邮箱',
    '登录IP',
    '登录时间',
    '设备类型',
    '登录方式',
    '地区',
    'User-Agent',
    '会话ID',
  ];
  
  const rows = logs.map(log => [
    log.id,
    log.user_id ? userEmails[log.user_id] || 'Unknown' : 'Guest',
    log.login_ip || '',
    log.login_at || '',
    log.device_type || 'Unknown',
    log.login_type || 'email',
    log.location || '',
    log.user_agent || '',
    log.session_id || '',
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  
  return csvContent;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
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
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const userIdFilter = searchParams.get('userId');
    
    // 4. 构建查询（导出最多10000条）
    let query = supabase
      .from('user_login_logs')
      .select('*');
    
    if (startTime) {
      query = query.gte('login_at', startTime);
    }
    if (endTime) {
      query = query.lte('login_at', endTime);
    }
    if (userIdFilter) {
      query = query.eq('user_id', userIdFilter);
    }
    
    const { data: logs, error: logsError } = await query
      .order('login_at', { ascending: false })
      .limit(10000);
    
    if (logsError) {
      console.error('[ExportLogs API] Query error:', logsError);
      return NextResponse.json(
        { success: false, error: 'Failed to query logs' },
        { status: 500 }
      );
    }
    
    // 5. 获取用户邮箱
    const userIds = [...new Set(logs?.map((log: { user_id: string | null }) => log.user_id).filter(Boolean) || [])];
    let userEmails: Record<string, string> = {};
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);
      
      userEmails = (profiles || []).reduce((acc: Record<string, string>, profile: { id: string; email: string | null }) => {
        acc[profile.id] = profile.email || 'Unknown';
        return acc;
      }, {} as Record<string, string>);
    }
    
    // 6. 生成CSV
    const csv = convertToCSV(logs || [], userEmails);
    
    // 7. 返回CSV文件
    const filename = `login_logs_${new Date().toISOString().split('T')[0]}.csv`;
    
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
    
  } catch (error) {
    console.error('[ExportLogs API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}