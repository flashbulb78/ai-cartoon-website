'use client';

/**
 * app/profile/page.tsx
 * 个人中心页面
 * 显示用户信息、剩余次数、历史作品列表
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { GenerationHistory } from '@/lib/types';
import { downloadImage } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [history, setHistory] = useState<GenerationHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const supabase = createClient();

  // 检查登录状态
  useEffect(() => {
    if (!profile && !isLoadingHistory) {
      router.push('/auth/login');
    }
  }, [profile, router, isLoadingHistory]);

  /**
   * 获取生成历史
   */
  const fetchHistory = useCallback(async () => {
    if (!user) return;

    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching history:', error);
      } else {
        setHistory(data || []);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user, fetchHistory]);

  /**
   * 处理下载
   */
  const handleDownload = useCallback((imageUrl: string, index: number) => {
    downloadImage(imageUrl, `cartoon-avatar-${index + 1}.png`);
  }, []);

  /**
   * 处理删除
   */
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this avatar?')) return;

    setIsDeleting(id);
    try {
      const { error } = await supabase
        .from('generations')
        .delete()
        .eq('id', id);

      if (error) {
        alert('Failed to delete. Please try again.');
      } else {
        setHistory((prev) => prev.filter((h) => h.id !== id));
      }
    } catch (error) {
      alert('Failed to delete. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  }, [supabase]);

  /**
   * 处理登出
   */
  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/');
  }, [signOut, router]);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* 头部 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* 左侧：返回按钮和Logo */}
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="hidden sm:inline">Back to Home</span>
              </Link>
              <div className="w-px h-6 bg-gray-200 hidden sm:block" />
              <Link href="/" className="flex items-center gap-3">
                <img
                  src="/avatar_logo_120.jpg"
                  alt="Magic Cartoon Avatar Logo"
                  className="w-10 h-10 rounded-xl object-cover"
                />
                <span className="text-xl font-bold text-gray-900 hidden sm:block">Magic Cartoon Avatar</span>
              </Link>
            </div>

            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 用户信息卡片 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* 头像 */}
            <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full rounded-2xl object-cover" />
              ) : (
                <span className="text-white text-3xl font-bold">
                  {profile.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              )}
            </div>

            {/* 信息 */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-bold text-gray-900">
                {profile.full_name || 'User'}
              </h1>
              <p className="text-gray-500">{profile.email}</p>

              {/* 标签 */}
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                {profile.is_premium ? (
                  <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-full">
                    ✨ Premium
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded-full">
                    Free Tier
                  </span>
                )}
              </div>
            </div>

            {/* 剩余次数 */}
            <div className="text-center p-4 bg-blue-50 rounded-xl min-w-[140px]">
              <p className="text-4xl font-bold text-blue-600">{profile.credits}</p>
              <p className="text-sm text-gray-600 mt-1">Credits Left</p>
            </div>
          </div>

          {/* 充值提示（次数不足或非Premium） */}
          {!profile.is_premium && profile.credits <= 2 && (
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900">Running low on credits?</p>
                  <p className="text-sm text-gray-600 mt-1">Upgrade to Premium for unlimited generations</p>
                </div>
                <Button variant="primary" onClick={() => window.location.href = '/pricing'}>
                  Upgrade Now
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 生成历史 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span>🖼️</span> Generation History
          </h2>

          {isLoadingHistory ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🎨</span>
              </div>
              <p className="text-gray-600 font-medium">No avatars generated yet</p>
              <p className="text-sm text-gray-400 mt-2">Start creating your first cartoon avatar!</p>
              <Link href="/">
                <Button variant="primary">Create Now</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {history.map((item, index) => (
                <div
                  key={item.id}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100"
                >
                  <img
                    src={item.generated_image}
                    alt={`Avatar ${index + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {/* 悬停操作层 */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleDownload(item.generated_image, index)}
                      className="p-2 bg-white rounded-full hover:bg-gray-100 transition-all"
                      title="Download"
                    >
                      <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={isDeleting === item.id}
                      className="p-2 bg-white rounded-full hover:bg-red-50 transition-all"
                      title="Delete"
                    >
                      {isDeleting === item.id ? (
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
                      ) : (
                        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* 风格标签 */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                    <p className="text-white text-xs font-medium capitalize">{item.style.replace('_', ' ')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}