'use client';

/**
 * app/auth/callback/page.tsx
 * OAuth认证回调页面
 * 处理Google等OAuth登录后的回调
 * 登录成功后自动跳转回首页
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // 处理OAuth回调
    const handleCallback = async () => {
      const supabase = createClient();

      // 获取URL中的code和state参数
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (code) {
        // 交换code获取session
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          // 成功，跳转回首页
          router.push('/');
          return;
        }
        console.error('Callback error:', error);
      }

      // 失败或异常，跳转到登录页
      router.push('/auth/login?error=auth_callback_failed');
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}