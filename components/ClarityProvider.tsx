'use client';

/**
 * components/ClarityProvider.tsx
 * Microsoft Clarity 用户行为分析
 * 仅在生产环境初始化，本地开发不加载
 */

import { useEffect } from 'react';
import clarity from '@microsoft/clarity';

const CLARITY_PROJECT_ID = 'xnw7x6uc2b';

export function ClarityProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      try {
        clarity.init(CLARITY_PROJECT_ID);
        console.log('[Clarity] initialized in production mode');
      } catch (error) {
        console.error('[Clarity] init failed:', error);
      }
    } else {
      console.log('[Clarity] skipped in development mode');
    }
  }, []);

  return <>{children}</>;
}