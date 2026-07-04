'use client';

/**
 * app/admin/logs/page.tsx
 * 管理员日志查看页面
 * 仅管理员可见，展示登录日志、访问统计
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

interface LoginLog {
  id: string;
  user_id: string | null;
  user_email: string;
  login_ip: string | null;
  login_at: string;
  user_agent: string | null;
  device_type: string;
  location: string | null;
  login_type: string;
  session_id: string | null;
}

interface UserStats {
  user_id: string;
  email: string;
  username: string;
  total_login_count: number;
  daily_login_count: number;
  last_login_at: string | null;
  first_login_at: string | null;
  last_ip: string | null;
  total_page_views: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function AdminLogsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  
  // 状态
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 筛选条件
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [ipKeyword, setIpKeyword] = useState('');
  const [loginTypeFilter, setLoginTypeFilter] = useState('');
  
  // 用户统计（选中用户时显示）
  const [selectedUserStats, setSelectedUserStats] = useState<UserStats | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  /**
   * 加载日志列表
   */
  const loadLogs = useCallback(async (page: number = 1) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pagination.pageSize),
      });
      
      if (startTime) params.append('startTime', startTime);
      if (endTime) params.append('endTime', endTime);
      if (ipKeyword) params.append('ip', ipKeyword);
      if (loginTypeFilter) params.append('loginType', loginTypeFilter);
      
      const response = await fetch(`/api/admin/login-logs?${params.toString()}`);
      const result = await response.json();
      
      if (result.success) {
        setLogs(result.data.logs);
        setPagination(result.data.pagination);
      } else {
        setError(result.error || 'Failed to load logs');
      }
    } catch (err) {
      setError('Network error');
      console.error('[AdminLogs] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [startTime, endTime, ipKeyword, loginTypeFilter, pagination.pageSize]);
  
  /**
   * 加载指定用户的统计信息
   */
  const loadUserStats = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/user-stats?userId=${userId}`);
      const result = await response.json();
      
      if (result.success) {
        setSelectedUserStats(result.data);
        setShowStatsModal(true);
      } else {
        alert(result.error || 'Failed to load user stats');
      }
    } catch (err) {
      console.error('[AdminLogs] Load user stats error:', err);
    }
  }, []);
  
  /**
   * 导出日志
   */
  const exportLogs = useCallback(() => {
    const params = new URLSearchParams();
    if (startTime) params.append('startTime', startTime);
    if (endTime) params.append('endTime', endTime);
    
    window.open(`/api/admin/export-logs?${params.toString()}`, '_blank');
  }, [startTime, endTime]);
  
  /**
   * 格式化日期时间
   */
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };
  
  /**
   * 格式化设备类型
   */
  const formatDeviceType = (type: string) => {
    const map: Record<string, string> = {
      'PC': '电脑',
      'Mobile': '手机',
      'Tablet': '平板',
      'Unknown': '未知',
    };
    return map[type] || type;
  };
  
  /**
   * 格式化登录方式
   */
  const formatLoginType = (type: string) => {
    const map: Record<string, string> = {
      'email': '邮箱',
      'google': 'Google',
      'github': 'GitHub',
      'guest': '游客',
    };
    return map[type] || type;
  };
  
  // 初始化检查
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [authLoading, user, router]);
  
  // 加载日志
  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadLogs(pagination.page);
    }
    // loadLogs is a stable callback that manages its own state transitions
  }, [user, pagination.page, loadLogs]);
  
  // 筛选变化时重新加载
  useEffect(() => {
    if (user && !isLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadLogs(1);
    }
    // loadLogs is a stable callback that manages its own state transitions
  }, [user, isLoading, startTime, endTime, ipKeyword, loginTypeFilter, loadLogs]);
  
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* 头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">用户日志管理</h1>
            <Button variant="secondary" onClick={exportLogs}>
              导出CSV
            </Button>
          </div>
        </div>
      </header>
      
      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 筛选器 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                开始时间
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                结束时间
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                IP关键词
              </label>
              <input
                type="text"
                value={ipKeyword}
                onChange={(e) => setIpKeyword(e.target.value)}
                placeholder="搜索IP..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                登录方式
              </label>
              <select
                value={loginTypeFilter}
                onChange={(e) => setLoginTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部</option>
                <option value="email">邮箱</option>
                <option value="google">Google</option>
                <option value="github">GitHub</option>
                <option value="guest">游客</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setStartTime('');
                  setEndTime('');
                  setIpKeyword('');
                  setLoginTypeFilter('');
                }}
              >
                重置筛选
              </Button>
            </div>
          </div>
        </div>
        
        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
            {error}
          </div>
        )}
        
        {/* 日志表格 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    用户
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP地址
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    登录时间
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    设备
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    登录方式
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    地区
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      加载中...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      暂无日志记录
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {log.user_email}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                        {log.login_ip || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDateTime(log.login_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDeviceType(log.device_type)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatLoginType(log.login_type)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {log.location || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {log.user_id && (
                          <button
                            onClick={() => loadUserStats(log.user_id!)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            查看统计
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* 分页 */}
          {!isLoading && logs.length > 0 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="text-sm text-gray-5">
                共 {pagination.total} 条记录，第 {pagination.page}/{pagination.totalPages} 页
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => loadLogs(pagination.page - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadLogs(pagination.page + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      
      {/* 用户统计弹窗 */}
      {showStatsModal && selectedUserStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-bold mb-4">用户访问统计</h2>
            
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">邮箱</span>
                <span className="font-medium">{selectedUserStats.email}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">用户名</span>
                <span className="font-medium">{selectedUserStats.username}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">累计登录次数</span>
                <span className="font-medium">{selectedUserStats.total_login_count}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">今日登录</span>
                <span className="font-medium">{selectedUserStats.daily_login_count}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">页面访问次数</span>
                <span className="font-medium">{selectedUserStats.total_page_views}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">首次登录</span>
                <span className="font-medium">{formatDateTime(selectedUserStats.first_login_at)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">最近登录</span>
                <span className="font-medium">{formatDateTime(selectedUserStats.last_login_at)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">最后登录IP</span>
                <span className="font-medium font-mono">{selectedUserStats.last_ip || '-'}</span>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <Button variant="secondary" onClick={() => setShowStatsModal(false)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}