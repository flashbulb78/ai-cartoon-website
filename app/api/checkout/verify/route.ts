import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/types';

/**
 * POST /api/checkout/verify
 * Verifies a Stripe checkout session and adds credits to user account
 * 
 * Request body: { sessionId: string }
 */
export async function POST(request: Request) {
  console.log('[Checkout Verify API] Starting verification');

  // Check if Stripe is configured
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[Checkout Verify API] Stripe secret key not configured');
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Payment system not configured' },
      { status: 503 }
    );
  }

  try {
    // Initialize Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // ========== 1. Create Supabase client ==========
    const supabase = await createClient();

    // ========== 2. Verify user authentication ==========
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.log('[Checkout Verify API] No authenticated user found');
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Please login first' },
        { status: 401 }
      );
    }
    console.log('[Checkout Verify API] User authenticated:', user.id);

    // ========== 3. Parse request body ==========
    let body: { sessionId?: string };
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[Checkout Verify API] JSON parse error:', parseError);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    if (!body.sessionId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // ========== 4. Retrieve Stripe session ==========
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(body.sessionId);
    } catch (stripeError) {
      console.error('[Checkout Verify API] Stripe retrieve error:', stripeError);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid checkout session' },
        { status: 400 }
      );
    }

    console.log('[Checkout Verify API] Stripe session status:', session.payment_status);

    // ========== 5. Verify session belongs to user ==========
    if (session.metadata?.userId !== user.id) {
      console.error('[Checkout Verify API] Session user mismatch:', {
        sessionUserId: session.metadata?.userId,
        currentUserId: user.id,
      });
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Session verification failed' },
        { status: 403 }
      );
    }

    // ========== 6. Check if already processed (idempotency) ==========
    // Check if we already added credits for this session
    const { data: existingTransaction } = await supabase
      .from('transactions')
      .select('id')
      .eq('stripe_session_id', body.sessionId)
      .maybeSingle();

    if (existingTransaction) {
      console.log('[Checkout Verify API] Session already processed:', body.sessionId);
      return NextResponse.json<ApiResponse<{ credits: number }>>(
        { success: true, data: { credits: parseInt(session.metadata?.credits || '0', 10) } },
        { status: 200 }
      );
    }

    // ========== 7. Only add credits if payment was successful ==========
    if (session.payment_status !== 'paid') {
      console.log('[Checkout Verify API] Payment not completed. Status:', session.payment_status);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Payment not completed' },
        { status: 400 }
      );
    }

    const creditsToAdd = parseInt(session.metadata?.credits || '0', 10);

    if (creditsToAdd <= 0) {
      console.error('[Checkout Verify API] Invalid credits amount:', creditsToAdd);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid credits amount' },
        { status: 400 }
      );
    }

    // ========== 8. Add credits to user profile ==========
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[Checkout Verify API] Profile fetch error:', profileError);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    const newCredits = (profile?.credits || 0) + creditsToAdd;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', user.id);

    if (updateError) {
      console.error('[Checkout Verify API] Credit update error:', updateError);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Failed to add credits' },
        { status: 500 }
      );
    }

    // ========== 9. Record transaction (for idempotency) ==========
    // Note: We'll create the transactions table in database.sql
    try {
      await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          stripe_session_id: body.sessionId,
          amount: (session.amount_total || 0) / 100, // Convert from cents
          credits: creditsToAdd,
          type: 'purchase',
          status: 'completed',
        });
    } catch (transactionError) {
      // Non-fatal error - log but don't fail
      console.warn('[Checkout Verify API] Failed to record transaction:', transactionError);
    }

    console.log('[Checkout Verify API] Success! Added', creditsToAdd, 'credits. New total:', newCredits);

    return NextResponse.json<ApiResponse<{ credits: number }>>(
      { 
        success: true, 
        data: { credits: creditsToAdd },
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('[Checkout Verify API] Unexpected error:', error);
    
    if (error instanceof Stripe.errors.StripeError) {
      console.error('[Checkout Verify API] Stripe error:', error.message);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Payment error: ${error.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}