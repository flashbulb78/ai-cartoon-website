'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * components/Header.tsx
 * 网站头部组件
 * 包含Logo和导航，登录用户下拉菜单（包含退出登录）
 */

interface HeaderProps {
  /** 是否已登录 */
  isLoggedIn?: boolean;
  /** 用户名（登录后显示） */
  userName?: string;
  /** 用户头像URL */
  userAvatar?: string | null;
  /** 用户剩余生成次数 */
  credits?: number;
  /** 登录点击回调 */
  onLogin?: () => void;
  /** 定价页点击回调 */
  onPricing?: () => void;
  /** 退出登录回调 */
  onSignOut?: () => void;
}

export function Header({ isLoggedIn, userName, userAvatar, credits, onLogin, onPricing, onSignOut }: HeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = () => {
    setIsDropdownOpen(false);
    if (onSignOut) {
      onSignOut();
    }
  };

  return (
    <header className="bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo区域 */}
          <div className="flex items-center gap-3">
            {/* Logo图标 */}
            <img
              src="/avatar_logo_120.jpg"
              alt="AI Cartoon Avatar Logo"
              className="w-10 h-10 rounded-xl object-cover shadow-md"
            />
            {/* 网站名称 */}
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                AI Cartoon Avatar
              </h1>
              <p className="text-xs text-gray-500 hidden sm:block">
                Transform your photos into stunning art
              </p>
            </div>
          </div>

          {/* 右侧导航 */}
          <nav className="flex items-center gap-2 sm:gap-4">
            {/* 主题切换 */}
            <ThemeToggle />
            
            {/* 定价按钮 */}
            {onPricing && (
              <button
                type="button"
                onClick={onPricing}
                className="
                  px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg
                  text-sm font-medium text-gray-600
                  hover:text-gray-900 hover:bg-gray-100
                  transition-all duration-200
                "
              >
                Pricing
              </button>
            )}

            {/* 分割线 */}
            <div className="hidden sm:block w-px h-6 bg-gray-200" />

            {/* 登录/用户信息区域 */}
            {userName ? (
              /* 已登录用户下拉菜单 */
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="
                    flex items-center gap-2 px-2 py-1.5 rounded-lg
                    hover:bg-gray-100 transition-all duration-200
                  "
                >
                  {/* 用户头像 */}
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={userName}
                      className="w-8 h-8 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-sm">
                      <span className="text-white text-sm font-semibold">
                        {(userName || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {/* 用户名 - 隐藏小屏幕 */}
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">
                    {userName}
                  </span>
                  {/* 向下箭头 */}
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* 下拉菜单 */}
                {isDropdownOpen && (
                  <div className="
                    absolute right-0 mt-2 w-48
                    bg-white rounded-xl shadow-lg shadow-gray-200/50
                    border border-gray-100 py-2
                    animate-in fade-in slide-in-from-top-2 duration-200
                  ">
                    {/* 用户信息 */}
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
                      <p className="text-xs text-gray-500">Signed in</p>
                      {credits !== undefined && (
                        <p className="text-xs font-medium text-blue-600 mt-1">
                          Remaining: {credits} {credits === 1 ? 'credit' : 'credits'}
                        </p>
                      )}
                    </div>
                    
                    {/* 菜单选项 */}
                    <div className="py-1">
                      <Link
                        href="/profile"
                        onClick={() => setIsDropdownOpen(false)}
                        className="
                          flex items-center gap-3 px-4 py-2
                          text-sm text-gray-700 hover:bg-gray-50
                          transition-colors duration-150
                        "
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        My Profile
                      </Link>
                      <Link
                        href="/creations"
                        onClick={() => setIsDropdownOpen(false)}
                        className="
                          flex items-center gap-3 px-4 py-2
                          text-sm text-gray-700 hover:bg-gray-50
                          transition-colors duration-150
                        "
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        My Creations
                      </Link>
                    </div>

                    {/* 分割线 */}
                    <div className="border-t border-gray-100 py-1">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="
                          flex items-center gap-3 w-full px-4 py-2
                          text-sm text-red-600 hover:bg-red-50
                          transition-colors duration-150
                        "
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : onLogin ? (
              <button
                type="button"
                onClick={onLogin}
                className="
                  px-4 py-2 rounded-xl
                  bg-blue-500 hover:bg-blue-600 text-white
                  text-sm font-semibold
                  transition-all duration-200
                  shadow-md shadow-blue-500/20
                  hover:shadow-lg hover:shadow-blue-500/30
                  active:scale-95
                "
              >
                Login
              </button>
            ) : null}
          </nav>
        </div>
      </div>
    </header>
  );
}
