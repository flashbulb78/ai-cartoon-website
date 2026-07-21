/**
 * lib/dodopayment.ts
 * DodoPayment API 封装
 * 
 * 文档: https://docs.dodopayments.com
 */

import crypto from 'crypto';

// 环境配置
// 生产环境 - 固定使用 live.dodopayments.com
// test 环境已下线，不再使用
const DODOPAYMENT_BASE_URL = 'https://live.dodopayments.com';

const DODOPAYMENT_API_KEY = process.env.DODO_PAYMENTS_API_KEY!;
const DODOPAYMENT_WEBHOOK_KEY = process.env.DODO_PAYMENTS_WEBHOOK_KEY!;

// 类型定义
export interface DodoProduct {
  product_id: string;
  quantity: number;
}

export interface DodoCustomer {
  customer_id?: string;
  email?: string;
  name?: string;
}

export interface DodoCheckoutRequest {
  product_cart: DodoProduct[];
  customer?: DodoCustomer;
  return_url?: string;
  cancel_url?: string;
  metadata?: Record<string, string>;
  billing_currency?: string;
  discount_code?: string;
  payment_method_types?: string[];
}

export interface DodoCheckoutResponse {
  session_id: string;
  url: string;
  expires_at: string;
}

export interface DodoPayment {
  payment_id: string;
  status: DodoPaymentStatus;
  total_amount: number;
  currency: string;
  customer: {
    customer_id: string;
    email: string;
  };
  metadata: Record<string, string>;
  created_at: string;
  payment_provider: string;
  digital_products_delivered: boolean;
}

export type DodoPaymentStatus =
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'processing'
  | 'requires_customer_action'
  | 'requires_merchant_action'
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_capture'
  | 'partially_captured'
  | 'partially_captured_and_capturable';

export interface DodoWebhookEvent {
  event_id: string;
  type: string;  // DodoPayment uses 'type' instead of 'event_type'
  event_type?: string;  // Keep for compatibility
  timestamp: string;
  data: {
    payment?: DodoPayment;
    checkout_session?: {
      session_id: string;
      status: string;
    };
  };
  metadata?: Record<string, string>;
}

/**
 * 验证 Webhook 签名
 * 遵循 Standard Webhooks 规范
 * 
 * @param rawBody 请求体（原始 Buffer）
 * @param webhookId webhook-id header
 * @param webhookTimestamp webhook-timestamp header
 * @param webhookSignature webhook-signature header
 * @returns 签名是否有效
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  webhookId: string,
  webhookTimestamp: string,
  webhookSignature: string
): boolean {
  try {
    const secret = DODOPAYMENT_WEBHOOK_KEY;
    const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
    
    // 1. 构造待签名字符串: webhook_id + "." + webhook_timestamp + "." + raw_body
    const signedPayload = `${webhookId}.${webhookTimestamp}.${body.toString('utf8')}`;
    
    // 2. 提取实际密钥并解码 (whsec_xxxx -> Base64 decoded)
    const secretValue = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const decodedKey = Buffer.from(secretValue, 'base64');
    
    // 3. 使用解码后的密钥计算 HMAC SHA256
    const expectedSignature = crypto
      .createHmac('sha256', decodedKey)
      .update(signedPayload)
      .digest('base64');
    
    const providedSignature = webhookSignature.replace('v1,', '');
    
    // 4. 使用 timing-safe 比较
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    );
  } catch (error) {
    console.error('[DodoPayment] Signature verification failed:', error);
    return false;
  }
}

/**
 * 创建 DodoPayment API 请求 Headers
 */
function getHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${DODOPAYMENT_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * 创建结账会话
 * 
 * @param params 结账参数
 * @returns 结账会话信息
 */
export async function createCheckoutSession(params: DodoCheckoutRequest): Promise<DodoCheckoutResponse> {
  const url = `${DODOPAYMENT_BASE_URL}/checkouts`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DodoPayment] Create checkout failed:', response.status, errorText);
    throw new Error(`DodoPayment checkout creation failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    session_id: data.session_id,
    url: data.url || data.checkout_url || data.redirect_url || `https://checkout.dodopayments.com?session=${data.session_id}`,
    expires_at: data.expires_at,
  };
}

/**
 * 查询支付状态
 * 
 * @param paymentId 支付 ID
 * @returns 支付信息
 */
export async function retrievePayment(paymentId: string): Promise<DodoPayment> {
  const url = `${DODOPAYMENT_BASE_URL}/payments/${paymentId}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DodoPayment] Retrieve payment failed:', response.status, errorText);
    throw new Error(`DodoPayment payment retrieval failed: ${response.status}`);
  }
  
  return response.json();
}

/**
 * 查询支付列表
 * 
 * @param options 查询选项
 * @returns 支付列表
 */
export async function listPayments(options: {
  status?: DodoPaymentStatus;
  customer_id?: string;
  product_id?: string;
  created_at_gte?: string;
  created_at_lte?: string;
  page_size?: number;
  page_number?: number;
} = {}): Promise<{ payments: DodoPayment[]; has_more: boolean }> {
  const params = new URLSearchParams();
  
  if (options.status) params.append('status', options.status);
  if (options.customer_id) params.append('customer_id', options.customer_id);
  if (options.product_id) params.append('product_id', options.product_id);
  if (options.created_at_gte) params.append('created_at_gte', options.created_at_gte);
  if (options.created_at_lte) params.append('created_at_lte', options.created_at_lte);
  if (options.page_size) params.append('page_size', String(options.page_size));
  if (options.page_number) params.append('page_number', String(options.page_number));
  
  const url = `${DODOPAYMENT_BASE_URL}/payments${params.toString() ? `?${params.toString()}` : ''}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DodoPayment] List payments failed:', response.status, errorText);
    throw new Error(`DodoPayment payment list failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    payments: data.data || [],
    has_more: data.has_more || false,
  };
}

/**
 * 检查是否为支付成功状态
 */
export function isPaymentSucceeded(payment: DodoPayment): boolean {
  return payment.status === 'succeeded';
}

/**
 * 获取 DodoPayment 环境 URL
 */
export function getDodoPaymentBaseUrl(): string {
  return DODOPAYMENT_BASE_URL;
}