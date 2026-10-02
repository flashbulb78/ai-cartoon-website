import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { retrievePayment } from '@/lib/dodopayment';
import { Button } from '@/components/ui/Button';

/**
 * app/checkout/success/page.tsx
 * DodoPayment 支付结果页（服务端渲染）
 *
 * 安全要点：不再无条件显示"支付成功"。
 * 必须先通过服务端校验：
 *   1. 本地 transactions 记录（webhook 已处理 → 权威结果）
 *   2. Dodo API retrievePayment（权威查询 + 支付归属校验）
 *   3. 两者都无法确认 → 展示"处理中"，绝不谎报成功
 */

type ResultState = 'success' | 'pending' | 'error';

interface PageResult {
  state: ResultState;
  title: string;
  message: string;
}

/** 支付明确失败的状态（Dodo 回传的 status 参数） */
const FAILED_STATUSES = [
  'failed',
  'cancelled',
  'canceled',
  'requires_payment_method',
  'requires_customer_action',
];

/**
 * 状态卡片外壳（统一布局，避免多份重复 JSX）
 */
function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">{children}</div>
      </div>
    </div>
  );
}

/**
 * 状态图标
 */
function StatusIcon({ tone }: { tone: 'green' | 'red' | 'amber' }) {
  const palette = {
    green: { bg: 'bg-green-100', fg: 'text-green-500', d: 'M5 13l4 4L19 7' },
    red: { bg: 'bg-red-100', fg: 'text-red-500', d: 'M6 18L18 6M6 6l12 12' },
    amber: {
      bg: 'bg-amber-100',
      fg: 'text-amber-500',
      d: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    },
  }[tone];

  return (
    <div className={`w-16 h-16 mx-auto mb-6 ${palette.bg} rounded-full flex items-center justify-center`}>
      <svg className={`w-8 h-8 ${palette.fg}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={palette.d} />
      </svg>
    </div>
  );
}

/**
 * 渲染结果卡片
 */
function renderResult({ state, title, message }: PageResult) {
  const tone = state === 'success' ? 'green' : state === 'pending' ? 'amber' : 'red';

  return (
    <StatusShell>
      <StatusIcon tone={tone} />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-600 mb-6">{message}</p>
      <div className="space-y-3">
        {state === 'success' && (
          <>
            <Link href="/" className="block">
              <Button variant="primary" className="w-full" size="lg">
                Start Creating
              </Button>
            </Link>
            <Link href="/pricing" className="block">
              <Button variant="outline" className="w-full">
                Buy More Credits
              </Button>
            </Link>
          </>
        )}

        {state === 'pending' && (
          <>
            <Link href="/profile" className="block">
              <Button variant="primary" className="w-full" size="lg">
                Check My Credits
              </Button>
            </Link>
            <Link href="/" className="block">
              <Button variant="outline" className="w-full">
                Back to Home
              </Button>
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <Link href="/pricing" className="block">
              <Button variant="primary" className="w-full" size="lg">
                Try Again
              </Button>
            </Link>
            <Link href="/" className="block">
              <Button variant="outline" className="w-full">
                Back to Home
              </Button>
            </Link>
          </>
        )}
      </div>
    </StatusShell>
  );
}

/**
 * 支付结果页
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    payment_id?: string;
    session_id?: string;
    status?: string;
    email?: string;
  }>;
}) {
  const params = await searchParams;
  // payment_id 为 Dodo 的支付 ID；session_id 是历史参数名，兼容处理
  const paymentId = params.payment_id || params.session_id;
  const statusParam = params.status;

  // ========== 1. 鉴权 ==========
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return renderResult({
      state: 'error',
      title: 'Please Sign In',
      message: 'Please login to view your payment result.',
    });
  }

  // ========== 2. 读取当前积分（服务端）==========
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('[CheckoutSuccess] Failed to load profile:', profileError);
    return renderResult({
      state: 'error',
      title: 'Something Went Wrong',
      message: 'Failed to load your account. Please refresh the page.',
    });
  }

  const credits = profile?.credits ?? 0;

  // ========== 3. 缺少支付标识 ==========
  if (!paymentId) {
    return renderResult({
      state: 'error',
      title: 'Something Went Wrong',
      message: 'No session ID found',
    });
  }

  // ========== 4. Dodo 明确回传失败状态 ==========
  if (statusParam && FAILED_STATUSES.includes(statusParam)) {
    return renderResult({
      state: 'error',
      title: 'Payment Not Completed',
      message: `Your payment was not completed (status: ${statusParam}). No credits were added.`,
    });
  }

  // ========== 5. 服务端校验支付是否真实成功 ==========
  let verified = false;
  let pendingMessage =
    'We are still confirming your payment with the payment provider. This usually completes within a minute.';

  // 5.1 本地交易记录（webhook 已处理 → 权威结果，且 RLS 保证只能读自己的记录）
  const { data: localTx, error: localError } = await supabase
    .from('transactions')
    .select('status')
    .eq('user_id', user.id)
    .eq('stripe_session_id', paymentId)
    .maybeSingle();

  if (localError) {
    console.error('[CheckoutSuccess] Local transaction query error:', localError);
  }

  if (localTx?.status === 'completed') {
    verified = true;
  }

  // 5.2 本地未命中 → 调用 Dodo API 做权威校验（含支付归属校验）
  if (!verified) {
    try {
      const payment = await retrievePayment(paymentId);
      const owner = payment.metadata?.user_id;

      // 关键：防止把他人的 payment_id 拼进 URL 冒充自己的支付
      if (owner && owner !== user.id) {
        console.warn('[CheckoutSuccess] Payment owner mismatch:', paymentId);
        return renderResult({
          state: 'error',
          title: 'Payment Not Found',
          message: 'This payment does not belong to your account.',
        });
      }

      if (payment.status === 'succeeded') {
        verified = true;
      } else {
        pendingMessage = `Your payment status is "${payment.status}". Credits will be added once the payment completes.`;
      }
    } catch (error) {
      console.error('[CheckoutSuccess] Failed to verify payment with Dodo:', error);
    }
  }

  // ========== 6. 渲染 ==========
  if (verified) {
    return renderResult({
      state: 'success',
      title: 'Payment Successful!',
      message: `You now have ${credits} credits in your account.`,
    });
  }

  // 无法确认真实成功 → 展示"处理中"，不谎报成功
  return renderResult({
    state: 'pending',
    title: 'Confirming Your Payment',
    message: pendingMessage,
  });
}

