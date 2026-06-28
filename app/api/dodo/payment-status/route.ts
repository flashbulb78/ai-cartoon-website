/**
 * app/api/dodo/payment-status/route.ts
 * 查询 DodoPayment 支付状态
 * 
 * GET /api/dodo/payment-status?session_id=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { retrievePayment, isPaymentSucceeded } from '@/lib/dodopayment';

/**
 * 查询支付状态
 * 用于前端轮询查询支付结果
 */
export async function GET(request: NextRequest) {
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
    
    // 2. 获取 session_id 参数
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'session_id is required' },
        { status: 400 }
      );
    }
    
    // 3. 查询本地订单记录
    // 由于 session_id 是 Dodo 的，我们需要在本地查找对应的记录
    // 暂时通过 metadata 中的 order_id 来关联
    
    // 4. 调用 DodoPayment API 查询支付状态
    // 注意：DodoPayment 没有直接通过 session_id 查询的 API
    // 需要通过 payment_id 查询，但 payment_id 需要从 webhook 或创建时的响应中获取
    // 这里先返回 pending 状态，前端应该通过 webhook 接收真正的支付结果
    
    // 实际上，session_id 对应的是 checkout_session，不是 payment
    // 支付完成后，Dodo 会通过 webhook 通知我们 payment_id
    // 然后我们本地更新订单状态
    
    // 所以这里查询本地数据库中的订单状态
    const { data: order } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    return NextResponse.json({
      success: true,
      data: {
        status: order?.status || 'pending',
        order_id: order?.id,
        message: 'Payment is being processed. You will be notified when it completes.',
      },
    });
    
  } catch (error) {
    console.error('[DodoPayment] Payment status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get payment status' },
      { status: 500 }
    );
  }
}