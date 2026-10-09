import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/siteConfig';

/**
 * robots.txt（部署后可通过 /robots.txt 访问）
 *
 * 除了声明抓取范围，这里最重要的作用是告知搜索引擎 sitemap 的位置 ——
 * 这是搜索引擎自动发现 sitemap 的主要途径之一。
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // 接口与后台
        '/api/',
        '/admin/',
        // 需要登录的用户页：爬虫抓到的是重定向或空页，抓取它们只会浪费抓取预算
        '/profile',
        '/creations',
        // 事务性页面
        '/checkout/',
        // 无搜索价值 / 不应被抓取的认证相关页面
        '/auth/callback',
        '/auth/forgot-password',
        '/auth/reset-password',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
