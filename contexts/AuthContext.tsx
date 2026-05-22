'use client';

/**
 * contexts/AuthContext.tsx
 * 全局认证状态管理Context
 * 提供用户登录状态、用户信息、次数限制等功能
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types';

// 认证上下文类型定义
interface AuthContextType {
  /** 当前用户 */
  user: User | null;
  /** 用户会话 */
  session: Session | null;
  /** 用户资料（含次数） */
  profile: UserProfile | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 登录 */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** 注册 */
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null }>;
  /** Google登录 */
  signInWithGoogle: () => Promise<{ error: string | null }>;
  /** 登出 */
  signOut: () => Promise<void>;
  /** 更新本地次数（用于生成后扣减） */
  decrementCredits: () => void;
  /** 刷新用户资料 */
  refreshProfile: () => Promise<void>;
}

// 创建Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider Props
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * 认证Provider组件
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  /**
   * 获取用户资料
   */
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      return data as UserProfile;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  }, [supabase]);

  /**
   * 刷新用户资料
   */
  const refreshProfile = useCallback(async () => {
    if (user) {
      const newProfile = await fetchProfile(user.id);
      if (newProfile) {
        setProfile(newProfile);
      }
    }
  }, [user, fetchProfile]);

  /**
   * 扣减次数（本地更新，优化体验）
   */
  const decrementCredits = useCallback(() => {
    if (profile && profile.credits > 0) {
      setProfile((prev: UserProfile | null) => prev ? { ...prev, credits: prev.credits - 1 } : null);
    }
  }, [profile]);

  /**
   * 邮箱密码登录
   */
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: 'An unexpected error occurred' };
    }
  }, [supabase]);

  /**
   * 邮箱注册
   */
  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || '',
          },
        },
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      return { error: 'An unexpected error occurred' };
    }
  }, [supabase]);

  /**
   * Google登录
   */
  const signInWithGoogle = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (error) {
      console.error('Google sign in error:', error);
      return { error: 'An unexpected error occurred' };
    }
  }, [supabase]);

  /**
   * 登出
   */
  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign out error:', error);
      }
      setUser(null);
      setSession(null);
      setProfile(null);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }, [supabase]);

  // 监听认证状态变化
  useEffect(() => {
    // 获取初始会话
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      // 如果有用户，获取用户资料
      if (session?.user) {
        fetchProfile(session.user.id).then((profileData) => {
          setProfile(profileData);
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    // 订阅认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const profileData = await fetchProfile(session.user.id);
          setProfile(profileData);
        } else {
          setProfile(null);
        }

        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const value: AuthContextType = {
    user,
    session,
    profile,
    isLoading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    decrementCredits,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 使用认证Context的Hook
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}