'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

/**
 * app/checkout/success/page.tsx
 * Stripe checkout success page
 * Handles post-payment credit addition
 */
export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [creditsAdded, setCreditsAdded] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const processSuccess = useCallback(async () => {
    if (!sessionId) {
      setStatus('error');
      setErrorMessage('No session ID found');
      return;
    }

    try {
      const supabase = createClient();

      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setStatus('error');
        setErrorMessage('Please login to continue');
        return;
      }

      // Call API to verify and add credits
      const response = await fetch('/api/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const result = await response.json();

      if (result.success && result.data?.credits) {
        setStatus('success');
        setCreditsAdded(result.data.credits);
      } else {
        setStatus('error');
        setErrorMessage(result.error || 'Failed to add credits');
      }

    } catch (err) {
      console.error('Error processing checkout:', err);
      setStatus('error');
      setErrorMessage('Failed to process payment');
    }
  }, [sessionId]);

  useEffect(() => {
    processSuccess();
  }, [processSuccess]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Loading State */}
        {status === 'loading' && (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Processing Payment
            </h2>
            <p className="text-gray-600">
              Please wait while we confirm your payment...
            </p>
          </div>
        )}

        {/* Success State */}
        {status === 'success' && (
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
        )}

        {/* Error State */}
        {status === 'error' && (
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
        )}
      </div>
    </div>
  );
}