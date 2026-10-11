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

      // ------------------------------------------------------------------
      // 静态资源缓存策略
      //
      // 默认情况下 Next 对 public/ 下的文件返回
      //   `cache-control: public, max-age=0, must-revalidate`
      // 也就是**每次访问都要重新校验一次**。这对 /models 尤其浪费：
      // 3 个模型权重文件合计约 612KB，几乎从不变化，却让每个回访者
      // 都要多走几轮往返（/samples 下是首页 LCP 示例图，同理）。
      //
      // 这里给 1 天新鲜期 + 1 周 stale-while-revalidate：
      //   · 1 天内回访：直接用本地缓存，零往返
      //   · 1 天之后：先用旧版本渲染，后台静默校验，用户无感
      //
      // ⚠️ 刻意**不**用 `immutable, max-age=31536000`：这些文件名没有内容哈希，
      //    一旦模型或示例图更新，长缓存会让回访者长时间看不到新版。
      //    若将来改成带版本号的文件名（例如 `...-shard1-v2`），可放宽到一年。
      // ------------------------------------------------------------------
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        source: '/samples/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
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
