import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClarityProvider } from "@/components/ClarityProvider";
import { getThemeInitScript } from "@/lib/theme";
import { getSiteUrlObject } from "@/lib/siteConfig";
import "./globals.css";

export const metadata: Metadata = {
  /**
   * 解析相对 URL（openGraph.images、twitter.images、alternates.canonical 等）的基准地址。
   * 重要：未配置 metadataBase 时，在这些「需要绝对 URL」的字段里使用相对路径
   *      会导致**构建报错**（Next.js 官方文档明确说明）。
   */
  metadataBase: getSiteUrlObject(),
  title: "Magic Cartoon Avatar - Transform Your Photos into Stunning Art",
  description: "Upload your photo and choose a style to generate unique cartoon avatars using AI. Free credits available!",
  keywords: ["AI", "cartoon", "avatar", "generator", "anime", "photo to cartoon"],
  openGraph: {
    title: "Magic Cartoon Avatar",
    description: "Transform your photos into stunning cartoon art with AI",
    type: "website",
  },
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
          <ClarityProvider>{children}</ClarityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
