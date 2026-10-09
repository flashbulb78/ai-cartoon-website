/**
 * lib/structuredData.ts
 * 结构化数据（JSON-LD）生成
 *
 * 与「通用建议」的几处刻意差异，都是为了避免结构化数据的常见错误：
 *
 *  1. offers 使用 AggregateOffer，且价格**由真实套餐数据计算**，绝不硬编码。
 *     硬编码价格在调价后会变成"不准确的报价"，而 Google 对结构化数据的
 *     准确性有明确政策要求 —— 不准确的数据会被忽略甚至导致富媒体结果被取消。
 *  2. 刻意**不添加 aggregateRating**：没有真实用户评价就编造评分属于作弊行为。
 *  3. 没有可用套餐时**省略 offers 字段**，而不是编造一个价格。
 */

import { SITE_NAME, SITE_DESCRIPTION, getSiteUrl } from './siteConfig';
import type { PricingPackage } from './types';

/** SoftwareApplication 结构化数据（含聚合报价） */
export interface SoftwareApplicationSchema {
  '@context': 'https://schema.org';
  '@type': 'SoftwareApplication';
  name: string;
  description: string;
  applicationCategory: string;
  operatingSystem: string;
  url: string;
  offers?: {
    '@type': 'AggregateOffer';
    priceCurrency: string;
    lowPrice: string;
    highPrice: string;
    offerCount: number;
  };
}

/**
 * 根据实际套餐数据生成 SoftwareApplication 结构化数据
 *
 * @param packages 定价页从数据库取到的可用套餐
 */
export function buildSoftwareApplicationSchema(
  packages: PricingPackage[]
): SoftwareApplicationSchema {
  const baseUrl = getSiteUrl();

  const prices = packages
    .map((pkg) => pkg.price)
    .filter((price): price is number => Number.isFinite(price));

  const schema: SoftwareApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    url: `${baseUrl}/`,
  };

  if (prices.length > 0) {
    schema.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: packages[0]?.currency || 'USD',
      lowPrice: Math.min(...prices).toFixed(2),
      highPrice: Math.max(...prices).toFixed(2),
      offerCount: prices.length,
    };
  }

  return schema;
}

/**
 * 序列化为可安全内联到 <script> 的字符串
 *
 * 转义 `<` 是为了防止数据中出现 `</script>` 提前闭合标签（标准防护做法）。
 */
export function serializeSchema(schema: unknown): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c');
}
