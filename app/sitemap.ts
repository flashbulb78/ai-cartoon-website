import type { MetadataRoute } from 'next';
import { getSiteUrl, CONTENT_LAST_MODIFIED } from '@/lib/siteConfig';

/**
 * 站点地图（部署后可通过 /sitemap.xml 访问）
 *
 * 收录范围：只放「公开、无需登录、且有实际内容」的页面。
 *
 * 刻意排除的页面及原因：
 *   - /profile、/creations        需要登录，爬虫只能抓到重定向或空页
 *   - /checkout/*、/admin/*、/api/*  事务性与后台页面
 *   - /auth/*                     无搜索价值（/auth/callback 更是 OAuth 处理接口）
 *
 * 注意：/pricing 目前的核心内容（套餐与价格）是在浏览器中拉取渲染的，
 *       预渲染 HTML 里没有这些文字。若要让它真正被搜索引擎收录到内容，
 *       需要先把该页改为服务端取数（见后续计划）。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();

  // 注意：next.config.ts 启用了 trailingSlash: true，
  // 因此子路径的规范地址是「带尾部斜杠」的形式（如 /pricing/）。
  // sitemap 里必须写规范地址，否则提交的每条 URL 都会立刻 308 跳转一次。
  return [
    {
      url: `${baseUrl}/`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/pricing/`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    // 法律页面：公开、无需登录、有实质内容，且需要能被搜索引擎与
    // Google OAuth 审核（consent screen 要求隐私政策 URL 可公开访问）找到。
    // 优先级低，但必须收录 —— 否则"隐私政策在哪"只能靠站内页脚发现。
    {
      url: `${baseUrl}/privacy/`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms/`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
