import Link from 'next/link';
import { SITE_NAME } from '@/lib/siteConfig';
import { SUPPORT_EMAIL } from '@/lib/legalConfig';

/**
 * components/SiteFooter.tsx
 * 全站页脚（服务端组件）
 *
 * 为什么需要它：
 *   1. /privacy 与 /terms 在此之前**没有任何入口**（全站没有页脚，也没有任何链接指向它们）。
 *      一个从任何页面都到不了的法律页面，既无法满足「法律信息须易于访问」的要求，
 *      也无法通过 Google OAuth 的 consent screen 审核（它要求隐私政策 URL 可公开访问）。
 *   2. 把法律链接放在全站页脚是行业标准做法，且只需维护一处。
 *
 * 样式说明：本项目通过 tailwind.config.ts 把 gray 调色板映射到主题变量
 *          （--foreground / --muted-foreground / --border 等），因此使用
 *          text-gray-* / bg-white / border-gray-* 即可自动适配深色主题，
 *          不需要（也不能）用 dark: 前缀 —— 主题切换走的是 [data-theme] 属性。
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            © {year} {SITE_NAME}. All rights reserved.
          </p>

          <nav aria-label="Legal and support links" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Pricing
            </Link>
            <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Terms of Service
            </Link>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Contact
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
