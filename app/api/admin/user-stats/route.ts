/**
 * app/api/admin/user-stats/route.ts
 * GET /api/admin/user-stats
 * 用户访问统计数据查询接口
 * 支持按用户ID查询单个用户的统计数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

/**
 * 检查用户是否为管理员
 */
async function isAdmin(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
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
    const targetUserId = searchParams.get('userId');
    
    if (!targetUserId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }
    
    // 4. 查询用户统计数据
    const { data: stats, error: statsError } = await supabase
      .from('user_access_stats')
      .select('*')
      .eq('user_id', targetUserId)
      .single();
    
    if (statsError) {
      console.error('[UserStats API] Query error:', statsError);
      return NextResponse.json(
        { success: false, error: 'User stats not found' },
        { status: 404 }
      );
    }
    
    // 5. 获取用户邮箱
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, username')
      .eq('id', targetUserId)
      .single();
    
    // 6. 返回结果
    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        email: profile?.email || 'Unknown',
        username: profile?.username || 'Unknown',
      },
    });
    
  } catch (error) {
    console.error('[UserStats API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}