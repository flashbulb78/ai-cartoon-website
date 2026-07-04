'use client';

/**
 * app/auth/reset-password/page.tsx
 * 重置密码页面 - 用户点击邮件链接后访问此页面设置新密码
 */

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

/**
 * 内部组件：处理密码重置表单
 * 使用 useSearchParams 需要被 Suspense 包裹
 */
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 初始化：处理 token 并恢复 session
  useEffect(() => {
    const initSession = async () => {
      try {
        const supabase = createClient();
        
        // 检查当前 session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          console.log('[ResetPassword] Session already exists');
          setIsReady(true);
          setIsLoading(false);
          return;
        }

        // 如果 URL 中有 token，尝试交换为 session
        const accessToken = searchParams.get('access_token');
        const refreshToken = searchParams.get('refresh_token');

        if (accessToken && refreshToken) {
          console.log('[ResetPassword] Found tokens in URL, exchanging for session');
          
          const { data, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setSessionError) {
            console.error('[ResetPassword] Set session error:', setSessionError);
            setError('Invalid or expired reset link. Please request a new one.');
          } else if (data.session) {
            console.log('[ResetPassword] Session restored successfully');
            setIsReady(true);
          } else {
            setError('Failed to restore session. Please request a new reset link.');
          }
        } else {
          // 没有 token 且没有 session
          console.log('[ResetPassword] No tokens in URL and no existing session');
          setError('Invalid reset link. Please request a new password reset email.');
        }
      } catch (err) {
        console.error('[ResetPassword] Init error:', err);
        setError('An unexpected error occurred.');
      } finally {
        setIsLoading(false);
      }
    };

    initSession();
  }, [searchParams]);

  // 密码验证状态
  const passwordValidations = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
  };
  const isPasswordValid = passwordValidations.length && passwordValidations.uppercase && passwordValidations.lowercase;
  const doPasswordsMatch = password === confirmPassword;

  /**
   * 处理密码重置
   */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isPasswordValid) {
      setError('Password does not meet the requirements.');
      return;
    }

    if (!doPasswordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess('Password reset successfully! Redirecting to login...');
        setTimeout(() => {
          router.push('/auth/login');
        }, 2000);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [password, confirmPassword, isPasswordValid, doPasswordsMatch, router]);

  // 加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <img
              src="/avatar_logo_120.jpg"
              alt="Magic Cartoon Avatar Logo"
              className="w-12 h-12 rounded-xl object-cover shadow-lg"
            />
            <span className="text-2xl font-bold text-gray-900">Magic Cartoon Avatar</span>
          </Link>
        </div>

        {/* 重置密码卡片 */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Set New Password</h1>
            <p className="text-gray-500 mt-2">
              Enter your new password below
            </p>
          </div>

          {/* 错误/成功提示 */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* 新密码 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all"
              />
              
              {/* 密码验证提示 */}
              {password.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <div className={`flex items-center gap-2 text-sm ${passwordValidations.length ? 'text-green-600' : 'text-red-500'}`}>
                    {passwordValidations.length ? '✅' : '❌'}
                    <span>At least 8 characters long</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${passwordValidations.uppercase ? 'text-green-600' : 'text-red-500'}`}>
                    {passwordValidations.uppercase ? '✅' : '❌'}
                    <span>Must contain uppercase letters (A-Z)</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${passwordValidations.lowercase ? 'text-green-600' : 'text-red-500'}`}>
                    {passwordValidations.lowercase ? '✅' : '❌'}
                    <span>Must contain lowercase letters (a-z)</span>
                  </div>
                </div>
              )}
            </div>

            {/* 确认新密码 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all"
              />
              {confirmPassword.length > 0 && !doPasswordsMatch && (
                <p className="mt-2 text-sm text-red-500">Passwords do not match</p>
              )}
            </div>

            {/* 提交按钮 */}
            <Button
              type="submit"
              isLoading={isLoading}
              disabled={!isReady || !isPasswordValid || !doPasswordsMatch}
              className="w-full"
              size="lg"
            >
              Reset Password
            </Button>
          </form>
        </div>

        {/* 返回首页 */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * 加载中的占位组件
 */
function ResetPasswordLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

/**
 * 页面组件 - 包裹在 Suspense 中
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
