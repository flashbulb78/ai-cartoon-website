'use client';

/**
 * app/admin/stats/page.tsx
 * 管理员统计页面
 * 展示各风格生成频次排行和可视化图表
 */

import { useState, useEffect } from 'react';
import { createClient, createAdminClient } from '@/lib/supabase/client';
import { STYLE_OPTIONS } from '@/lib/constants';

interface StyleStat {
  style_name: string;
  total_count: number;
}

interface DailyStat {
  date: string;
  label: string;
  total: number;
}

interface StatsResponse {
  success: boolean;
  data?: {
    leaderboard: StyleStat[];
    dailyStats: DailyStat[];
    totalGenerations: number;
  };
  error?: string;
}

/**
 * 获取风格显示名称
 */
function getStyleDisplayName(styleId: string): string {
  const style = STYLE_OPTIONS.find(s => s.id === styleId);
  return style ? `${style.emoji} ${style.name}` : styleId;
}

/**
 * 获取风格emoji
 */
function getStyleEmoji(styleId: string): string {
  const style = STYLE_OPTIONS.find(s => s.id === styleId);
  return style?.emoji || '🎨';
}

export default function AdminStatsPage() {
  const [stats, setStats] = useState<StatsResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    checkAdminAndFetchStats();
  }, []);

  /**
   * 检查用户是否为管理员并获取统计数据
   */
  const checkAdminAndFetchStats = async () => {
    try {
      const supabase = createClient();
      const adminClient = createAdminClient();

      // 获取当前用户
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsAdmin(false);
        setError('Please login to view statistics');
        setLoading(false);
        return;
      }

      // 检查用户是否为管理员
      const { data: adminData } = await adminClient
        .from('admins')
        .select('user_id, role')
        .eq('user_id', user.id)
        .single();

      if (!adminData) {
        setIsAdmin(false);
        setError('Access denied. Admin privileges required.');
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      // 获取统计数据
      const response = await fetch('/api/admin/stats');
      const result: StatsResponse = await response.json();

      if (result.success && result.data) {
        setStats(result.data);
      } else {
        setError(result.error || 'Failed to load statistics');
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setError('Failed to load statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 渲染排行榜
   */
  const renderLeaderboard = () => {
    if (!stats?.leaderboard || stats.leaderboard.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No statistics yet</p>
          <p className="text-sm mt-2">Statistics will appear after users generate avatars</p>
        </div>
      );
    }

    const maxCount = Math.max(...stats.leaderboard.map(s => s.total_count));

    return (
      <div className="space-y-4">
        {stats.leaderboard.map((item, index) => {
          const percentage = maxCount > 0 ? (item.total_count / maxCount) * 100 : 0;
          const rank = index + 1;
          const isTop3 = rank <= 3;

          return (
            <div key={item.style_name} className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {/* 排名 */}
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                    ${isTop3 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white' : 'bg-gray-100 text-gray-600'}
                  `}>
                    {isTop3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                  </div>
                  {/* 风格名称 */}
                  <div>
                    <p className="font-medium text-gray-900">{getStyleDisplayName(item.style_name)}</p>
                    <p className="text-sm text-gray-500">{item.style_name}</p>
                  </div>
                </div>
                {/* 使用次数 */}
                <div className="text-right">
                  <span className="text-lg font-bold text-gray-900">{item.total_count}</span>
                  <span className="text-sm text-gray-500 ml-1">times</span>
                </div>
              </div>
              {/* 进度条 */}
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`
                    h-full rounded-full transition-all duration-500
                    ${isTop3 ? 'bg-gradient-to-r from-blue-500 to-purple-500' : 'bg-blue-400'}
                  `}
                  style={{ width: `${Math.max(percentage, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * 渲染每日趋势图
   */
  const renderDailyChart = () => {
    if (!stats?.dailyStats || stats.dailyStats.length === 0) {
      return null;
    }

    const maxTotal = Math.max(...stats.dailyStats.map(d => d.total), 1);

    return (
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Trend (Last 7 Days)</h3>
        <div className="flex items-end justify-between gap-2 h-48">
          {stats.dailyStats.map((day) => {
            const height = maxTotal > 0 ? (day.total / maxTotal) * 100 : 0;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                {/* 数值 */}
                <span className="text-sm font-medium text-gray-600">{day.total}</span>
                {/* 柱状图 */}
                <div className="w-full bg-gray-100 rounded-t-lg relative" style={{ height: '160px' }}>
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-lg transition-all duration-500"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                </div>
                {/* 日期标签 */}
                <span className="text-xs text-gray-500">{day.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 加载状态
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading statistics...</p>
        </div>
      </div>
    );
  }

  // 访问被拒绝
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">{error || 'You do not have permission to view this page.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">📊 Style Usage Statistics</h1>
          <p className="text-gray-600 mt-2">Monitor style popularity and user preferences</p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* 总体统计卡片 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-500 mb-1">Total Generations</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalGenerations}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-500 mb-1">Active Styles</p>
              <p className="text-3xl font-bold text-gray-900">{stats.leaderboard?.length || 0}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-500 mb-1">Today's Generations</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.dailyStats?.find(d => d.date === new Date().toISOString().split('T')[0])?.total || 0}
              </p>
            </div>
          </div>
        )}

        {/* 风格排行榜 */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">🏆 Style Leaderboard</h2>
          {renderLeaderboard()}
        </div>

        {/* 每日趋势图 */}
        {stats && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            {renderDailyChart()}
          </div>
        )}
      </div>
    </div>
  );
}