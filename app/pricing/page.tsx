import type { Metadata } from 'next';
import { createPublicReadClient } from '@/lib/supabase/server';
import { PricingPackage } from '@/lib/types';
import { PricingClient } from './PricingClient';

/**
 * app/pricing/page.tsx
 * 定价页（服务端组件）
 *
 * 为什么改成服务端取数：
 *   原实现是「客户端组件 + useEffect 拉数据」，导致预渲染 HTML 里
 *   完全没有套餐名称与价格（实测 HTML 中 "Starter"、"1.49" 命中次数均为 0）。
 *   搜索引擎抓到的是一张近乎空白的页面 —— 收录了也没有内容可排名。
 *   改为服务端取数后，套餐信息会直接写进 HTML。
 *
 * 缓存策略：套餐价格变动不频繁，使用 ISR 每小时再生成一次，
 *          兼得「静态页面的速度」与「内容可被抓取」。
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Pricing & Credit Packs',
  description:
    'Buy AI cartoon avatar credits with one-time credit packs. All 13 cartoon styles included, instant delivery, credits never expire.',
  alternates: {
    // 相对路径会与 app/layout.tsx 中的 metadataBase 组合成绝对 URL
    canonical: '/pricing',
  },
};

/**
 * 读取可用的定价套餐（公开数据，无需登录）
 *
 * 出错时返回空数组而不抛异常：由页面展示友好提示，
 * 避免因为数据库瞬时不可用导致整页 500（也让构建期的取数失败不会中断构建）。
 */
async function fetchPricingPackages(): Promise<PricingPackage[]> {
  try {
    const supabase = createPublicReadClient();

    const { data, error } = await supabase
      .from('pricing_packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[PricingPage] Failed to fetch pricing packages:', error);
      return [];
    }

    return (data ?? []) as PricingPackage[];
  } catch (error) {
    console.error('[PricingPage] Unexpected error while fetching packages:', error);
    return [];
  }
}

export default async function PricingPage() {
  const packages = await fetchPricingPackages();

  return <PricingClient packages={packages} />;
}
