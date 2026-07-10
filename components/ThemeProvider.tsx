'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'ai-cartoon-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize theme on app mount
    const stored = localStorage.getItem(STORAGE_KEY) as 'light' | 'dark' | 'system' | null;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let theme: 'light' | 'dark';
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else if (stored === 'system') {
      theme = systemPrefersDark ? 'dark' : 'light';
    } else {
      // Default: use system preference
      theme = systemPrefersDark ? 'dark' : 'light';
    }

    // Apply theme class to document
    document.documentElement.classList.remove('dark', 'light');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  return <>{children}</>;
}
