'use client';

/**
 * app/pricing/PricingClient.tsx
 * 定价页的交互部分（客户端组件）
 *
 * 设计说明：
 *   套餐数据由父级服务端组件（app/pricing/page.tsx）取好后经 props 传入。
 *   这样套餐名称与价格会出现在**预渲染 HTML** 中，可被搜索引擎收录；
 *   而本组件只负责展示与「发起购买」的交互。
 *   （原实现是在 useEffect 里从浏览器拉数据，导致 HTML 里没有任何套餐内容）
 */

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PricingPackage } from '@/lib/types';
import { Button } from '@/components/ui/Button';

interface PricingClientProps {
  /** 服务端取好的可用套餐列表（按 sort_order 升序） */
  packages: PricingPackage[];
}

export function PricingClient({ packages }: PricingClientProps) {
  const { user } = useAuth();
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  };

  const calculatePricePerCredit = (pkg: PricingPackage) => {
    if (pkg.credits <= 0) return 0;
    return pkg.price / pkg.credits;
  };

  /**
   * 发起购买：调用服务端创建 DodoPayment 结账会话，然后跳转到支付页
   */
  const handlePurchase = useCallback(async (packageId: string) => {
    if (!user) {
      window.location.href = '/auth/login';
      return;
    }

    setIsPurchasing(packageId);
    try {
      // 注意：必须加尾部斜杠，否则 Vercel 会 308 重定向导致请求体丢失
      const response = await fetch('/api/dodo/create-checkout/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: packageId }),
      });

      const result = await response.json();

      if (result.success && result.data?.checkout_url) {
        window.location.href = result.data.checkout_url;
      } else {
        alert(result.error || 'Failed to initiate purchase. Please try again.');
      }
    } catch (err) {
      console.error('Purchase error:', err);
      alert('Failed to initiate purchase. Please try again.');
    } finally {
      setIsPurchasing(null);
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <img
                src="/logo_192.png"
                alt="Magic Cartoon Avatar Logo"
                className="w-10 h-10 rounded-xl object-cover shadow-md"
              />
              <span className="text-xl font-bold text-gray-900">Magic Cartoon Avatar</span>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-4">
              <Link href="/">
                <Button variant="outline" size="sm">
                  Back to Home
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page Title */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Plan
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Select the package that best fits your needs. All plans include access to all cartoon styles.
          </p>
        </div>

        {/* 空状态：服务端取数失败或暂无可用套餐时，避免出现空白页 */}
        {packages.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-600 mb-4">
              Pricing plans are temporarily unavailable. Please try again later.
            </p>
            <Link href="/">
              <Button variant="outline">Back to Home</Button>
            </Link>
          </div>
        )}

        {/* Pricing Cards */}
        {packages.length > 0 && (
          <>
            <div className="flex flex-wrap justify-center gap-6 lg:gap-8">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`
                    relative bg-white rounded-2xl shadow-sm border transition-all duration-200 w-full max-w-sm
                    ${pkg.is_highlighted
                      ? 'border-blue-500 shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/20'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                    }
                  `}
                >
                  {/* Popular Badge */}
                  {pkg.is_highlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-semibold bg-blue-500 text-white shadow-md">
                        Popular
                      </span>
                    </div>
                  )}

                  <div className="p-6 lg:p-8">
                    {/* Package Name */}
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {pkg.name}
                    </h3>

                    {/* Description */}
                    {pkg.description && (
                      <p className="text-gray-500 text-sm mb-4">
                        {pkg.description}
                      </p>
                    )}

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-gray-900">
                          {formatPrice(pkg.price, pkg.currency)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {pkg.credits} credits
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        ${calculatePricePerCredit(pkg).toFixed(3)} per credit
                      </div>
                    </div>


                    {/* Features */}
                    <ul className="space-y-3 mb-6">
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {pkg.credits} credit pack
                      </li>
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        All cartoon styles
                      </li>
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        High-quality downloads
                      </li>
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Instant delivery
                      </li>
                    </ul>

                    {/* CTA Button */}
                    {user ? (
                      <Button
                        className="w-full"
                        variant="primary"
                        size="lg"
                        onClick={() => handlePurchase(pkg.id)}
                        isLoading={isPurchasing === pkg.id}
                      >
                        {isPurchasing === pkg.id ? 'Processing...' : `Select ${pkg.name}`}
                      </Button>
                    ) : (
                      <Link href="/auth/login" className="block">
                        <Button className="w-full" variant="primary" size="lg">
                          Login to Purchase
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Note */}
            <div className="mt-12 text-center">
              <p className="text-sm text-gray-500">
                All prices are in USD. Credits never expire. Cancel anytime.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Need a custom plan?{' '}
                <a href="mailto:support@aicartoon.com" className="text-blue-500 hover:underline">
                  Contact us
                </a>
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

