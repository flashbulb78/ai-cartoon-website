/**
 * lib/siteConfig.ts
 * 站点级配置的唯一来源（供 metadata / robots.txt / sitemap.xml 共用）
 *
 * 为什么集中在一处：
 *   这些地方都需要「站点的绝对 URL」。若各自硬编码，一旦域名发生变化
 *   （加/去 www、切换环境），就会出现 canonical、sitemap、robots 指向不同域名
 *   的情况 —— 这对 SEO 是有害的（会被视为指向了另一个站点）。
 */

/** 站点名称（与页面品牌名保持一致） */
export const SITE_NAME = 'Magic Cartoon Avatar';

/** 站点描述（用于 metadata 与结构化数据） */
export const SITE_DESCRIPTION =
  'Turn your photos into Pixar, Anime, Cyberpunk and 10 more cartoon avatar styles with AI. New users get free credits, with transparent round-cut PNG export for Discord, TikTok and Instagram.';

/**
 * 正式域名兜底值
 * 生产环境应通过环境变量 NEXT_PUBLIC_BASE_URL 配置（当前为 https://www.magicyoyoyo.com）
 */
const FALLBACK_SITE_URL = 'https://www.magicyoyoyo.com';

/**
 * 站点绝对 URL（字符串，不含结尾斜杠）
 * 供 robots.ts / sitemap.ts 使用
 */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_URL?.trim();

  if (!raw) {
    return FALLBACK_SITE_URL;
  }

  // 容忍缺少协议的写法（例如 magicyoyoyo.com）
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    // 取 origin：自动去掉结尾斜杠与多余路径，
    // 避免拼出 "https://site.com//sitemap.xml" 这类地址
    return new URL(normalized).origin;
  } catch {
    console.warn('[SiteConfig] Invalid NEXT_PUBLIC_BASE_URL, using fallback:', raw);
    return FALLBACK_SITE_URL;
  }
}

/**
 * 站点绝对 URL（URL 对象形式，供 metadataBase 使用）
 */
export function getSiteUrlObject(): URL {
  return new URL(getSiteUrl());
}

/**
 * 内容最后更新日期（用于 sitemap 的 lastModified）
 *
 * 注意：这里刻意**不使用** new Date()。
 * 若每次构建都写入"当前时间"，等于每次部署都对搜索引擎声称所有页面刚刚更新过；
 * 长期不可信的 lastModified 会被 Google 直接忽略（官方文档明确说明）。
 * 请在页面内容有实质更新时再修改此日期。
 */
export const CONTENT_LAST_MODIFIED = new Date('2026-08-24T00:00:00.000Z');
