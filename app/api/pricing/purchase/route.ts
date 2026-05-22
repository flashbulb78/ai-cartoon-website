import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/types';

/**
 * Cost safety validation constants
 * Minimum price per credit ($0.02) to cover Stripe fees + Minimax cost
 */
const MIN_PRICE_PER_CREDIT = 0.02;

/**
 * POST /api/pricing/purchase
 * Creates a Stripe checkout session for purchasing credits
 * 
 * Request body: { packageId: string }
 */
export async function POST(request: Request) {
  console.log('[Purchase API] Starting purchase request');

  // Check if Stripe is configured
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[Purchase API] Stripe secret key not configured');
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Payment system not configured' },
      { status: 503 }
    );
  }

  try {
    // Initialize Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-04-22.dahlia',
    });

    // ========== 1. Create Supabase client ==========
    const supabase = await createClient();

    // ========== 2. Verify user authentication ==========
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error('[Purchase API] Auth error:', authError);
    }

    if (!user) {
      console.log('[Purchase API] No authenticated user found');
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Please login first' },
        { status: 401 }
      );
    }
    console.log('[Purchase API] User authenticated:', user.id);

    // ========== 3. Parse request body ==========
    let body: { packageId?: string };
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[Purchase API] JSON parse error:', parseError);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    if (!body.packageId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Package ID is required' },
        { status: 400 }
      );
    }

    // ========== 4. Fetch package from database ==========
    const { data: pkg, error: packageError } = await supabase
      .from('pricing_packages')
      .select('*')
      .eq('id', body.packageId)
      .eq('is_active', true)
      .single();

    if (packageError) {
      console.error('[Purchase API] Package fetch error:', packageError);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Package not found' },
        { status: 404 }
      );
    }

    if (!pkg) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Package not found' },
        { status: 404 }
      );
    }

    console.log('[Purchase API] Package found:', pkg.name, 'price:', pkg.price, 'credits:', pkg.credits);

    // ========== 5. Cost Safety Validation ==========
    const pricePerCredit = pkg.price / pkg.credits;
    
    if (pricePerCredit < MIN_PRICE_PER_CREDIT) {
      console.error('[Purchase API] Cost safety violation:', {
        package: pkg.name,
        price: pkg.price,
        credits: pkg.credits,
        pricePerCredit,
        minimumAllowed: MIN_PRICE_PER_CREDIT,
      });
      
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Package pricing error. Please contact support.' },
        { status: 400 }
      );
    }

    console.log('[Purchase API] Cost safety validated. Price per credit:', pricePerCredit.toFixed(4));

    // ========== 6. Get or create Stripe customer ==========
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, full_name')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: profile?.email || user.email,
        name: profile?.full_name || undefined,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;

      // Save customer ID to profile
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // ========== 7. Create Stripe Checkout Session ==========
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: pkg.currency.toLowerCase(),
            product_data: {
              name: `${pkg.name} - ${pkg.credits} Credits`,
              description: pkg.description || `${pkg.credits} credits for AI Cartoon Avatar generation`,
            },
            unit_amount: Math.round(pkg.price * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: {
        userId: user.id,
        packageId: pkg.id,
        credits: pkg.credits.toString(),
      },
    });

    console.log('[Purchase API] Stripe session created:', session.id);

    return NextResponse.json<ApiResponse<{ sessionUrl: string; sessionId: string }>>(
      { 
        success: true, 
        data: { 
          sessionUrl: session.url!,
          sessionId: session.id,
        },
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('[Purchase API] Unexpected error:', error);
    
    if (error instanceof Stripe.errors.StripeError) {
      console.error('[Purchase API] Stripe error:', error.message);
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