'use client';

/**
 * components/ThemeToggle.tsx
 * 明暗主题切换按钮
 *
 * 实现说明：
 *  - 图标显隐由 CSS（Tailwind 的 dark: 工具类）驱动，
 *    因此首屏渲染出来就是正确图标，不依赖 React 状态（避免图标闪变）
 *  - 点击时直接读取/写入 lib/theme 的当前主题，组件内无需任何状态
 *  - 主题初始化在 app/layout.tsx 的内联脚本中完成（消除刷新时的主题闪烁）
 */

import { getCurrentTheme, setStoredTheme } from '@/lib/theme';

export function ThemeToggle() {
  const handleToggle = () => {
    const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    setStoredTheme(next);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors"
      aria-label="Toggle light or dark theme"
      title="Toggle light or dark theme"
    >
      {/* 浅色模式：显示月亮（点击切到深色） */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="block dark:hidden text-foreground"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>

      {/* 深色模式：显示太阳（点击切到浅色） */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hidden dark:block text-foreground"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    </button>
  );
}
