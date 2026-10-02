import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure trailing slash for proper Vercel routing
  trailingSlash: true,
  
  // 图片优化配置
  // 说明：本项目图片均通过原生 <img> 渲染（生成结果是 base64 data URL），并未使用 next/image。
  // 但 hostname 设为 '**' 会让 /_next/image 变成「可代理任意 https 地址」的入口（SSRF 风险），
  // 因此这里收紧为白名单。若今后用 next/image 加载外部图片，请在此显式添加对应域名。
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'minimaxi.com' },
      { protocol: 'https', hostname: '**.minimaxi.com' },
      { protocol: 'https', hostname: 'minimax.io' },
      { protocol: 'https', hostname: '**.minimax.io' },
      { protocol: 'https', hostname: 'aliyuncs.com' },
      { protocol: 'https', hostname: '**.aliyuncs.com' },
    ],
  },
  
  // Security headers - exclude static assets
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
  
  // Experimental features
  experimental: {
    // Enable server actions for better performance
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
