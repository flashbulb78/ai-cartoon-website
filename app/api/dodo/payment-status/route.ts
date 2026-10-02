/**
 * app/api/dodo/payment-status/route.ts
 * 查询 DodoPayment 支付状态（供前端轮询 / 页面兜底）
 *
 * GET /api/dodo/payment-status?payment_id=pay_xxx
 * GET /api/dodo/payment-status?order_id=order_xxx   （回退：按本地订单号查）
 *
 * 校验顺序：
 *   1. 本地 transactions（webhook 已处理则为权威结果，最快且不依赖外部 API）
 *   2. Dodo API retrievePayment（本地未命中时做权威校验，并校验支付归属）
 *   3. 均无法确认 → 返回 pending（绝不谎报成功）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { retrievePayment } from '@/lib/dodopayment';

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

    // 2. 解析查询参数（payment_id 优先，其次 order_id）
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('payment_id');
    const orderId = searchParams.get('order_id');
    const reference = paymentId || orderId;

    if (!reference) {
      return NextResponse.json(
        { success: false, error: 'payment_id or order_id is required' },
        { status: 400 }
      );
    }

    // 3. 本地交易记录核对（RLS 保证只能读到自己的记录）
    const { data: localTx, error: localError } = await supabase
      .from('transactions')
      .select('id, credits, status, amount, created_at')
      .eq('user_id', user.id)
      .eq('stripe_session_id', reference)
      .maybeSingle();

    if (localError) {
      console.error('[DodoPayment] Local transaction query error:', localError);
    }

    if (localTx?.status === 'completed') {
      return NextResponse.json({
        success: true,
        data: {
          status: 'completed',
          source: 'local',
          order_id: localTx.id,
          credits: localTx.credits,
          amount: localTx.amount,
          message: 'Payment completed and credits have been added.',
        },
      });
    }

    // 4. 本地未命中时，向 Dodo 做权威校验
    if (paymentId) {
      try {
        const payment = await retrievePayment(paymentId);

        // 归属校验：防止用他人的 payment_id 查询
        const owner = payment.metadata?.user_id;
        if (owner && owner !== user.id) {
          console.warn('[DodoPayment] Payment does not belong to current user:', paymentId);
          return NextResponse.json(
            { success: false, error: 'This payment does not belong to your account' },
            { status: 403 }
          );
        }

        if (payment.status === 'succeeded') {
          // Dodo 已确认成功，但 webhook 可能尚未落库（异步延迟）
          return NextResponse.json({
            success: true,
            data: {
              status: 'succeeded',
              source: 'dodo',
              credits: payment.metadata?.credits ? parseInt(payment.metadata.credits, 10) : undefined,
              message: 'Payment succeeded. Credits are being added to your account.',
            },
          });
        }

        return NextResponse.json({
          success: true,
          data: {
            status: payment.status,
            source: 'dodo',
            message: 'Payment is being processed.',
          },
        });
      } catch (error) {
        // Dodo API 不可用（或该 payment_id 不存在）→ 回退为本地状态
        console.error('[DodoPayment] Failed to retrieve payment from Dodo:', error);
      }
    }

    // 5. 无法确认 → pending（不谎报成功）
    return NextResponse.json({
      success: true,
      data: {
        status: localTx?.status || 'pending',
        source: 'local',
        order_id: localTx?.id,
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
