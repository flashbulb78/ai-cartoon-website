/**
 * app/api/dodo/create-checkout/route.ts
 * 创建 DodoPayment 结账会话
 * 
 * POST /api/dodo/create-checkout
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCheckoutSession, DodoCheckoutRequest } from '@/lib/dodopayment';

/**
 * 创建结账会话
 * 
 * 请求体:
 * {
 *   product_id: string,      // DodoPayment 商品 ID
 *   quantity: number,        // 购买数量
 *   user_id?: string         // 用户 ID（可选，用于 metadata）
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户认证
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // 2. 解析请求体
    const body = await request.json();
    const { product_id, quantity = 1 } = body;
    
    if (!product_id) {
      return NextResponse.json(
        { success: false, error: 'product_id is required' },
        { status: 400 }
      );
    }
    
    // 3. 获取商品信息以计算 credits
    const { data: pricingPackage, error: packageError } = await supabase
      .from('pricing_packages')
      .select('credits, name')
      .eq('id', product_id)
      .eq('is_active', true)
      .single();
    
    if (packageError || !pricingPackage) {
      console.error('[DodoPayment] Package not found:', product_id, packageError);
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 400 }
      );
    }
    
    // 计算总 credits
    const totalCredits = pricingPackage.credits * quantity;
    
    // 4. 构建 DodoPayment 请求
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const orderId = `order_${Date.now()}_${user.id.slice(0, 8)}`;
    
    const checkoutRequest: DodoCheckoutRequest = {
      product_cart: [
        { product_id, quantity }
      ],
      customer: {
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      },
      return_url: `${baseUrl}/checkout/success`,
      cancel_url: `${baseUrl}/checkout/cancel`,
      metadata: {
        user_id: user.id,
        order_id: orderId,
        credits: String(totalCredits),  // 存储 credits 数量
        package_name: pricingPackage.name,  // 存储套餐名称
      },
      billing_currency: 'USD',
    };
    
    // 4. 调用 DodoPayment API
    const checkout = await createCheckoutSession(checkoutRequest);
    
    // 5. 返回结账 URL
    return NextResponse.json({
      success: true,
      data: {
        checkout_url: checkout.url,
        session_id: checkout.session_id,
        expires_at: checkout.expires_at,
      },
    });
    
  } catch (error) {
    console.error('[DodoPayment] Create checkout error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}