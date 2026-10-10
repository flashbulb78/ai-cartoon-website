import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClarityProvider } from "@/components/ClarityProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { getThemeInitScript } from "@/lib/theme";
import { getSiteUrlObject, SITE_NAME, SITE_DESCRIPTION } from "@/lib/siteConfig";
import "./globals.css";

export const metadata: Metadata = {
  /**
   * 解析相对 URL（openGraph.images、twitter.images、alternates.canonical 等）的基准地址。
   * 重要：未配置 metadataBase 时，在这些「需要绝对 URL」的字段里使用相对路径
   *      会导致**构建报错**（Next.js 官方文档明确说明）。
   */
  metadataBase: getSiteUrlObject(),

  /**
   * 标题模板：子页面只需写自己的标题，会自动补上站点名后缀。
   * 例如定价页声明 "Pricing & Credit Packs" → 实际渲染为
   * "Pricing & Credit Packs | Magic Cartoon Avatar"。
   * 首页（根段）使用 default，不会被套模板。
   */
  title: {
    default: "Magic Cartoon Avatar - AI Cartoon Avatar Generator",
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ["AI", "cartoon", "avatar", "generator", "anime", "photo to cartoon", "discord avatar", "tiktok avatar"],

  openGraph: {
    title: "Magic Cartoon Avatar - AI Cartoon Avatar Generator",
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Magic Cartoon Avatar - turn your photos into stunning cartoon avatars",
      },
    ],
  },

  /**
   * Twitter/X 卡片。Next 会从 openGraph 派生一部分，
   * 但 card 类型与图片需要显式声明才稳定。
   */
  twitter: {
    card: "summary_large_image",
    title: "Magic Cartoon Avatar - AI Cartoon Avatar Generator",
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },

  /**
   * 注意：这里刻意**不设置** alternates.canonical。
   * 根 layout 的 canonical 会应用到所有路由，等于把所有页面都声明成首页的副本，
   * 对 SEO 有害。canonical 应由各页面自行声明（如 app/pricing/page.tsx 已设置）。
   */

  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning：<html> 上的 data-theme/class 会被下面的内联脚本
    // 在 hydration 之前修改，属于预期行为，需要抑制 React 的属性不一致告警
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          主题初始化脚本：内联在 <head> 中同步执行，
          在浏览器首次绘制前就把主题写入 <html>，消除深色用户刷新时的浅色闪烁。
          逻辑与唯一来源见 lib/theme.ts
        */}
        <script dangerouslySetInnerHTML={{ __html: getThemeInitScript() }} />
      </head>
      <body className="antialiased">
        {/* 全局认证Provider */}
        <AuthProvider>
          <ClarityProvider>
            {children}
            {/* 全站页脚：法律信息必须能从每个页面到达（Google OAuth 审核也要求隐私政策可公开访问） */}
            <SiteFooter />
          </ClarityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
