import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
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
  let creditsAdded = 0;
  let errorMessage: string | null = null;
  let isSuccess = false;

  try {
    const supabase = createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      errorMessage = 'Please login to continue';
    } else {
      // Call API to verify and add credits
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/checkout/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      });

      const result = await response.json();

      if (result.success && result.data?.credits) {
        creditsAdded = result.data.credits;
        isSuccess = true;
      } else {
        errorMessage = result.error || 'Failed to add credits';
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
              {creditsAdded} credits have been added to your account.
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
