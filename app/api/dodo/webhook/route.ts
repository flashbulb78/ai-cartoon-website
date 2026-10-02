/**
 * app/api/dodo/webhook/route.ts
 * DodoPayment Webhook 回调处理
 * 
 * POST /api/dodo/webhook
 * 
 * DodoPayment 会在支付成功后 POST 到此地址
 * 必须：
 * 1. 验证签名（防伪造）
 * 2. 使用 webhook-id 去重（幂等）
 * 3. 立即返回 200（否则会重试）
 * 4. 异步处理业务逻辑
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, DodoWebhookEvent } from '@/lib/dodopayment';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * 处理支付成功事件
 *
 * 幂等与并发安全：
 * 积分登记完全交给数据库函数 process_credit_purchase 在**单个事务**内完成，
 * 它以 payment_id 作为幂等键并依赖 transactions.stripe_session_id 唯一约束，
 * 因此：
 *   - 同一支付重复投递 → 不会重复加分
 *   - 并发投递 → 唯一约束使其中一个失败并回滚，不会重复加分
 *   - 记账与加分原子化 → 不会出现"有记录没加分"或"加了分没记录"
 */
async function handlePaymentSucceeded(
  event: DodoWebhookEvent,
  supabaseAdmin: ReturnType<typeof createAdminClient>
) {
  // DodoPayment sends payment data directly in event.data, not event.data.payment
  const payment = event.data as unknown as DodoWebhookEvent['data']['payment'];
  if (!payment || !payment.payment_id) {
    // 抛出异常 → 外层标记 failed 并返回 5xx，让 Dodo 重试
    throw new Error('No payment data in event');
  }

  const userId = payment.metadata?.user_id;
  const orderId = payment.metadata?.order_id;
  const creditsStr = payment.metadata?.credits;

  if (!userId) {
    throw new Error('No user_id in payment metadata');
  }

  const creditsToAdd = creditsStr ? parseInt(creditsStr, 10) : 0;

  if (!Number.isFinite(creditsToAdd) || creditsToAdd <= 0) {
    throw new Error(`Invalid credits value: ${creditsStr}`);
  }

  console.log('[DodoPayment Webhook] Payment succeeded:', {
    payment_id: payment.payment_id,
    user_id: userId,
    order_id: orderId,
    amount: payment.total_amount,
    currency: payment.currency,
    credits_to_add: creditsToAdd,
  });

  // 幂等 + 记账 + 加积分（单事务，由数据库保证一致性）
  const { data, error } = await supabaseAdmin
    .rpc('process_credit_purchase', {
      p_payment_id: payment.payment_id,
      p_user_id: userId,
      p_credits: creditsToAdd,
      p_amount: payment.total_amount ?? 0,
      p_status: 'completed',
    })
    .single();

  if (error) {
    throw new Error(`process_credit_purchase failed: ${error.message}`);
  }

  const result = (Array.isArray(data) ? data[0] : data) as {
    success: boolean;
    already_processed: boolean;
    new_credits: number | null;
    error_message: string | null;
  } | null;

  if (!result?.success) {
    throw new Error(result?.error_message || 'Failed to grant credits');
  }

  if (result.already_processed) {
    console.log(
      '[DodoPayment Webhook] Already processed, skipped duplicate credit grant. payment_id:',
      payment.payment_id
    );
  } else {
    console.log(
      '[DodoPayment Webhook] Credits granted. user:',
      userId,
      'credits:',
      creditsToAdd,
      'new balance:',
      result.new_credits
    );
  }
}

/**
 * 处理支付失败事件
 */
async function handlePaymentFailed(
  event: DodoWebhookEvent,
  supabaseAdmin: ReturnType<typeof createAdminClient>
) {
  // DodoPayment sends payment data directly in event.data, not event.data.payment
  const payment = event.data as unknown as DodoWebhookEvent['data']['payment'];
  if (!payment || !payment.payment_id) return;

  const userId = payment.metadata?.user_id;

  console.log('[DodoPayment Webhook] Payment failed:', {
    payment_id: payment.payment_id,
    user_id: userId,
    status: payment.status,
  });

  // 记录失败支付用于审计
  // 注意：使用 "failed:" 前缀作为唯一键，避免与成功支付的幂等键冲突
  //       （否则失败记录会挡住后续真正成功时的积分发放）
  if (userId) {
    const { error } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: userId,
        stripe_session_id: `failed:${payment.payment_id}`,
        amount: payment.total_amount ?? 0,
        credits: 0,
        type: 'purchase',
        status: 'failed',
      });

    if (error && error.code !== '23505') {
      console.error('[DodoPayment Webhook] Failed to record failed payment:', error);
    }
  }
}

export async function POST(request: NextRequest) {
  // 1. 获取原始请求体（用于验签）
  const rawBody = await request.text();
  const body = Buffer.from(rawBody);
  
  // 2. 获取 webhook headers
  const webhookId = request.headers.get('webhook-id');
  const webhookSignature = request.headers.get('webhook-signature');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  
  if (!webhookId || !webhookSignature || !webhookTimestamp) {
    console.error('[DodoPayment Webhook] Missing headers');
    return NextResponse.json(
      { error: 'Missing webhook headers' },
      { status: 400 }
    );
  }
  
  // 3. 验证签名
  const isValid = verifyWebhookSignature(body, webhookId, webhookTimestamp, webhookSignature);
  
  if (!isValid) {
    console.error('[DodoPayment Webhook] Invalid signature');
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    );
  }
  
  // 4. 解析事件数据
  let event: DodoWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    console.error('[DodoPayment Webhook] Failed to parse body:', error);
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }
  
  console.log('[DodoPayment Webhook] Received event:', event.type, {
    event_id: event.event_id,
    payment_id: event.data?.payment?.payment_id,
  });
  
  // 5. 幂等登记（webhook 级）
  // 说明：真正"不重复发放积分"由数据库函数 process_credit_purchase 基于
  //       payment_id + 唯一约束保证。这里只做事件登记与去重簿记：
  //       - 已登记且 status=processed → 重复投递，直接返回
  //       - 已登记但 status=received/failed → 上次未处理完，允许重试
  //         （重试是安全的，因为积分发放本身幂等）
  const supabaseAdmin = createAdminClient();

  const { error: logInsertError } = await supabaseAdmin
    .from('webhook_logs')
    .insert({
      webhook_id: webhookId,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
      status: 'received',
    });
  
  // 旧的"先查后插"式幂等检查已移除（存在 TOCTOU 竞态），
  // 改为上面的 insert 冲突判定 + 数据库层 payment_id 唯一约束
  
  if (logInsertError) {
    if (logInsertError.code === '23505') {
      // 事件已登记过 → 查看其状态
      const { data: existingLog } = await supabaseAdmin
        .from('webhook_logs')
        .select('status')
        .eq('webhook_id', webhookId)
        .single();

      if (existingLog?.status === 'processed') {
        console.log('[DodoPayment Webhook] Duplicate event already processed, skipping:', webhookId);
        return NextResponse.json({ received: true, duplicate: true });
      }

      console.log(
        '[DodoPayment Webhook] Retrying previously incomplete event:',
        webhookId,
        'status:',
        existingLog?.status
      );
    } else {
      console.error('[DodoPayment Webhook] Failed to record webhook log:', logInsertError);
      // 返回 5xx 让 Dodo 重试，避免事件静默丢失
      return NextResponse.json(
        { error: 'Failed to record webhook' },
        { status: 500 }
      );
    }
  }
  
  // 6. 处理事件（同步处理，确保在 serverless 环境中可靠执行）
  
  const markProcessed = async () => {
    await supabaseAdmin
      .from('webhook_logs')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('webhook_id', webhookId);
  };

  try {
    // 根据事件类型处理 (使用 type 字段)
    switch (event.type) {
      case 'payment.succeeded':
        await handlePaymentSucceeded(event, supabaseAdmin);
        await markProcessed();
        break;
        
      case 'payment.failed':
        await handlePaymentFailed(event, supabaseAdmin);
        await markProcessed();
        break;
        
      default:
        console.log('[DodoPayment Webhook] Unhandled event type:', event.type);
        await markProcessed();
    }
  } catch (error) {
    console.error('[DodoPayment Webhook] Error processing event:', error);
    // 更新为失败状态
    await supabaseAdmin
      .from('webhook_logs')
      .update({ status: 'failed', error: String(error) })
      .eq('webhook_id', webhookId);

    // 返回 5xx 让 Dodo 重试；重试时会继续处理（status=failed），
    // 且积分发放是幂等的，不会重复加分
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}