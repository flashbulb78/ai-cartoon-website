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
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * 处理支付成功事件
 */
async function handlePaymentSucceeded(
  event: DodoWebhookEvent,
  supabaseAdmin: ReturnType<typeof createAdminClient>
) {
  // DodoPayment sends payment data directly in event.data, not event.data.payment
  const payment = event.data as unknown as DodoWebhookEvent['data']['payment'];
  if (!payment || !payment.payment_id) {
    console.error('[DodoPayment Webhook] No payment data in event', { eventData: event.data });
    return;
  }
  
  const userId = payment.metadata?.user_id;
  const orderId = payment.metadata?.order_id;
  const creditsStr = payment.metadata?.credits;
  
  if (!userId) {
    console.error('[DodoPayment Webhook] No user_id in payment metadata');
    return;
  }
  
  // 从 metadata 获取 credits 数量
  const creditsToAdd = creditsStr ? parseInt(creditsStr, 10) : 0;
  
  if (creditsToAdd <= 0) {
    console.error('[DodoPayment Webhook] Invalid credits value:', creditsStr);
    return;
  }
  
  console.log('[DodoPayment Webhook] Payment succeeded:', {
    payment_id: payment.payment_id,
    user_id: userId,
    order_id: orderId,
    amount: payment.total_amount,
    currency: payment.currency,
    credits_to_add: creditsToAdd,
  });
  
  // 1. 更新用户 credits（直接读取后更新）
  const { data: currentProfile } = await supabaseAdmin
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single();
  
  if (currentProfile) {
    const newCredits = (currentProfile.credits || 0) + creditsToAdd;
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', userId);
    
    if (updateError) {
      console.error('[DodoPayment Webhook] Failed to update credits:', updateError);
    } else {
      console.log('[DodoPayment Webhook] Credits updated successfully:', newCredits);
    }
  } else {
    console.error('[DodoPayment Webhook] Profile not found for user:', userId);
  }
  
  // 2. 记录交易（用于审计）
  await supabaseAdmin
    .from('transactions')
    .insert({
      user_id: userId,
      stripe_session_id: orderId || payment.payment_id,
      amount: payment.total_amount,
      credits: creditsToAdd,
      type: 'purchase',
      status: 'completed',
    });
  
  console.log('[DodoPayment Webhook] Transaction recorded for user:', userId, 'credits:', creditsToAdd);
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
  
  console.log('[DodoPayment Webhook] Payment failed:', {
    payment_id: payment.payment_id,
    user_id: payment.metadata?.user_id,
    status: payment.status,
  });
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
  
  // 5. 幂等检查 - 使用 webhook-id 去重
  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();
  
  const { data: existingLog } = await supabaseAdmin
    .from('webhook_logs')
    .select('id')
    .eq('webhook_id', webhookId)
    .single();
  
  if (existingLog) {
    // 已经处理过这个事件，直接返回
    console.log('[DodoPayment Webhook] Duplicate event, skipping:', webhookId);
    return NextResponse.json({ received: true });
  }
  
  // 6. 记录 webhook 日志（立即落库）
  await supabaseAdmin
    .from('webhook_logs')
    .insert({
      webhook_id: webhookId,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
      status: 'received',
    });
  
  // 7. 处理事件（同步处理，确保在 serverless 环境中可靠执行）
  try {
    // 根据事件类型处理 (使用 type 字段)
    switch (event.type) {
      case 'payment.succeeded':
        await handlePaymentSucceeded(event, supabaseAdmin);
        // 更新 webhook 状态
        await supabaseAdmin
          .from('webhook_logs')
          .update({ status: 'processed' })
          .eq('webhook_id', webhookId);
        break;
        
      case 'payment.failed':
        await handlePaymentFailed(event, supabaseAdmin);
        await supabaseAdmin
          .from('webhook_logs')
          .update({ status: 'processed' })
          .eq('webhook_id', webhookId);
        break;
        
      default:
        console.log('[DodoPayment Webhook] Unhandled event type:', event.type);
    }
  } catch (error) {
    console.error('[DodoPayment Webhook] Error processing event:', error);
    // 更新为失败状态
    await supabaseAdmin
      .from('webhook_logs')
      .update({ status: 'failed', error: String(error) })
      .eq('webhook_id', webhookId);
  }

  return NextResponse.json({ received: true });
}