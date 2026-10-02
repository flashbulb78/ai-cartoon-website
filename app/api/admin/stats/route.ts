import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/stats
 * 获取风格使用统计数据（仅管理员可访问）
 */
export async function GET() {
  try {
    // ========== 1. 验证用户认证 ==========
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('[Admin Stats API] Auth error:', authError);
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ========== 2. 验证管理员角色 ==========
    // 统一以 public.admins 表为唯一管理员来源（与其它 admin 接口保持一致），
    // 避免依赖 profiles.is_admin 列（该列不在 schema 中，且客户端可被篡改）。
    // 使用带 RLS 的客户端：admins 表的 SELECT 策略仅允许查询自己的记录，
    // 因此非管理员查询结果为 0 行。
    const { data: adminRecord, error: adminError } = await supabase
      .from('admins')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single();

    if (adminError && adminError.code !== 'PGRST116') {
      console.error('[Admin Stats API] Admin check failed:', adminError);
      return NextResponse.json(
        { success: false, error: 'Failed to verify admin status' },
        { status: 500 }
      );
    }

    if (!adminRecord) {
      console.error('[Admin Stats API] Non-admin user attempted access:', user.id);
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    console.log('[Admin Stats API] Admin access granted for:', user.id, 'role:', adminRecord.role);

    // 统计数据通过 service_role 读取
    const adminClient = createAdminClient();

    // ========== 3. 获取按风格分组的统计数据 ==========
    const { data: styleStats, error: styleError } = await adminClient
      .from('style_usage_stats')
      .select('style_name, usage_count, stat_date')
      .order('stat_date', { ascending: false })
      .order('usage_count', { ascending: false });

    if (styleError) {
      console.error('[Admin Stats API] Failed to fetch style stats:', styleError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch statistics' },
        { status: 500 }
      );
    }

    // ========== 计算各风格总使用次数 ==========
    const styleTotals: Record<string, number> = {};
    const dailyStats: Record<string, Record<string, number>> = {};

    if (styleStats) {
      for (const stat of styleStats) {
        // 累加总次数
        styleTotals[stat.style_name] = (styleTotals[stat.style_name] || 0) + stat.usage_count;
        
        // 按日期统计
        const dateKey = stat.stat_date;
        if (!dailyStats[dateKey]) {
          dailyStats[dateKey] = {};
        }
        dailyStats[dateKey][stat.style_name] = stat.usage_count;
      }
    }

    // ========== 转换为排行榜格式 ==========
    const leaderboard = Object.entries(styleTotals)
      .map(([style_name, total_count]) => ({
        style_name,
        total_count,
      }))
      .sort((a, b) => b.total_count - a.total_count);

    // ========== 获取最近7天的数据 ==========
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      last7Days.push({
        date: dateKey,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        total: styleStats
          ? styleStats
              .filter((s: { stat_date: string }) => s.stat_date === dateKey)
              .reduce((sum: number, s: { usage_count: number }) => sum + s.usage_count, 0)
          : 0,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        leaderboard,
        dailyStats: last7Days,
        totalGenerations: leaderboard.reduce((sum, item) => sum + item.total_count, 0),
      },
    });
  } catch (error) {
    console.error('[Admin Stats API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}