import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/Button';

/**
 * app/checkout/success/page.tsx
 * Stripe checkout success page
 * Handles post-payment credit addition
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_id?: string; session_id?: string; status?: string; email?: string }>;
}) {
  const params = await searchParams;
  const paymentId = params.payment_id || params.session_id;
  const status = params.status;
  const email = params.email;

  // If no payment/session ID, show error
  if (!paymentId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Something Went Wrong
            </h2>
            <p className="text-gray-600 mb-6">
              No session ID found
            </p>
            <div className="space-y-3">
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Process payment on server
  // Note: DodoPayment adds credits via webhook, so we just need to show success and fetch updated credits
  let credits = 0;
  let errorMessage: string | null = null;
  let isSuccess = false;

  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      errorMessage = 'Please login to continue';
    } else {
      // Fetch user's current credits (webhook already added them via DodoPayment)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        errorMessage = 'Failed to load credits';
      } else {
        credits = profile?.credits || 0;
        isSuccess = true;
      }
    }
  } catch (err) {
    console.error('Error processing checkout:', err);
    errorMessage = 'Failed to process payment';
  }

  // Render based on result
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Payment Successful!
            </h2>
            <p className="text-gray-600 mb-6">
              You now have {credits} credits in your account.
            </p>
            <div className="space-y-3">
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Something Went Wrong
          </h2>
          <p className="text-gray-600 mb-6">
            {errorMessage || 'Failed to process your payment. Please contact support.'}
          </p>
          <div className="space-y-3">
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
          </div>
        </div>
      </div>
    </div>
  );
}
