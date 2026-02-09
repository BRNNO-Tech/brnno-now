// Supabase Edge Function: create and confirm a Stripe PaymentIntent for checkout.
// Set STRIPE_SECRET_KEY in Supabase project secrets.
// When service_id and vehicle are provided, amount is computed server-side for fair pricing.

import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type VehicleSize = 'sedan' | 'medium' | 'large' | 'xl';

const PRICING_MATRIX: Record<string, Record<VehicleSize, number>> = {
  'interior-detail': { sedan: 175, medium: 215, large: 250, xl: 300 },
  'exterior-detail': { sedan: 125, medium: 150, large: 185, xl: 225 },
  'full-detail': { sedan: 250, medium: 285, large: 315, xl: 375 },
};

const XL_PATTERNS = ['transit', 'sprinter', 'promaster', 'nv', 'express', 'savana', 'dualy', 'dually', '3500', '4500', '5500', 'chassis cab', 'e-series', 'econoline'];
const LARGE_PATTERNS = ['f-150', 'f150', 'silverado', 'sierra 1500', 'sierra 2500', 'sierra 3500', 'ram 1500', 'ram 2500', 'ram 3500', 'tundra', 'titan', 'suburban', 'yukon xl', 'escalade esv', 'navigator l', 'armada', 'tahoe', 'yukon', 'expedition', 'sequoia', '4runner', 'wrangler', 'gladiator', 'bronco', 'ranger', 'colorado', 'canyon', 'frontier', 'tacoma', 'ridgeline', 'sierra', 'denali', 'durango', 'grand cherokee', 'telluride', 'palisade', 'atlas', 'ascent', 'highlander', 'pilot', 'passport', 'explorer', 'traverse', 'atlas cross sport'];
const MEDIUM_PATTERNS = ['cr-v', 'crv', 'rav4', 'rav 4', 'escape', 'equinox', 'rogue', 'tucson', 'sportage', 'cx-5', 'cx5', 'forester', 'outback', 'crosstrek', 'edge', 'murano', 'pathfinder', 'acadia', 'enclave', 'compass', 'renegade', 'cherokee', 'bronco sport', 'model y', 'model x', 'id.4', 'ev6', 'ioniq 5', 'mach-e', 'mustang mach-e'];
const SEDAN_PATTERNS = ['civic', 'accord', 'camry', 'corolla', 'altima', 'maxima', 'sentra', 'fusion', 'malibu', 'impala', 'cruze', 'spark', 'elantra', 'sonata', 'optima', 'k5', 'forte', 'rio', 'passat', 'jetta', 'golf', 'gli', 'gti', 'mazda3', 'mazda 3', 'mazda6', 'mazda 6', 'legacy', 'wrx', 'impreza', 'model 3', 'model s', 'a3', 'a4', 'a6', '3 series', '5 series', 'c-class', 'e-class', 'tlx', 'ilx', 'rlx', 'cts', 'ct5', 'ct6'];

function inferVehicleSize(make: string, model: string): VehicleSize {
  const m = (make || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const mod = (model || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!m || !mod) return 'medium';
  const combined = `${m} ${mod}`;
  const has = (arr: string[]) => arr.some((p) => combined.includes(p));
  if (has(XL_PATTERNS)) return 'xl';
  if (has(LARGE_PATTERNS)) return 'large';
  if (has(MEDIUM_PATTERNS)) return 'medium';
  if (has(SEDAN_PATTERNS)) return 'sedan';
  if (m === 'ram') return 'large';
  if (m === 'gmc' && (mod.includes('sierra') || mod.includes('yukon') || mod.includes('canyon') || mod.includes('denali'))) return 'large';
  if (m === 'ford' && (mod.includes('f-') || mod.includes('f150') || mod.includes('ranger') || mod.includes('expedition') || mod.includes('bronco'))) return 'large';
  if (m === 'chevrolet' && (mod.includes('silverado') || mod.includes('tahoe') || mod.includes('suburban'))) return 'large';
  if (m === 'toyota' && (mod.includes('tundra') || mod.includes('tacoma') || mod.includes('sequoia') || mod.includes('4runner'))) return 'large';
  if (m === 'jeep' && (mod.includes('wrangler') || mod.includes('gladiator') || mod.includes('grand cherokee'))) return 'large';
  return 'medium';
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const paymentMethodId = body?.payment_method_id as string; // Stripe pm_xxx from our DB row
    const metadata = (body?.metadata as Record<string, string>) ?? {};
    const serviceId = body?.service_id as string | undefined;
    const vehicle = body?.vehicle as { make?: string; model?: string; year?: string } | undefined;

    let amountCents: number;
    if (serviceId && vehicle?.make != null && vehicle?.model != null) {
      const size = inferVehicleSize(String(vehicle.make), String(vehicle.model));
      const row = PRICING_MATRIX[serviceId];
      const price = row?.[size] ?? 0;
      amountCents = Math.round(price * 100);
    } else {
      amountCents = Math.round(Number(body?.amount_cents));
    }

    if (!amountCents || amountCents < 50) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!paymentMethodId) {
      return new Response(JSON.stringify({ error: 'Missing payment_method_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ensure the payment method belongs to this user. Frontend sends stripe_payment_method_id (pm_xxx).
    let pmRow: { stripe_payment_method_id: string; stripe_customer_id: string | null } | null = null;
    let pmError: { message: string } | null = null;

    const byStripeId = await supabase
      .from('payment_methods')
      .select('stripe_payment_method_id, stripe_customer_id')
      .eq('user_id', user.id)
      .eq('stripe_payment_method_id', paymentMethodId)
      .maybeSingle();
    if (byStripeId.error) pmError = byStripeId.error;
    else if (byStripeId.data) pmRow = byStripeId.data;

    if (!pmRow && !pmError) {
      const byDbId = await supabase
        .from('payment_methods')
        .select('stripe_payment_method_id, stripe_customer_id')
        .eq('user_id', user.id)
        .eq('id', paymentMethodId)
        .maybeSingle();
      if (byDbId.error) pmError = byDbId.error;
      else if (byDbId.data) pmRow = byDbId.data;
    }

    if (pmError) {
      return new Response(JSON.stringify({ error: 'Payment method lookup failed', detail: pmError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!pmRow) {
      return new Response(JSON.stringify({ error: 'Payment method not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripePmId = pmRow.stripe_payment_method_id;

    // Get or create Stripe customer so PaymentIntent is linked to a Customer (not Guest) and card can be saved.
    let customerId: string | null = null;
    const { data: custRow } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (custRow?.stripe_customer_id) {
      customerId = custRow.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from('stripe_customers').upsert(
        { user_id: user.id, stripe_customer_id: customer.id },
        { onConflict: 'user_id' }
      );
    }

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        capture_method: 'manual',
        customer: customerId,
        payment_method: stripePmId,
        confirm: true,
        setup_future_usage: 'off_session',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: { supabase_user_id: user.id, ...metadata },
      });
    } catch (stripeErr: unknown) {
      const message = stripeErr instanceof Error ? stripeErr.message : 'Stripe error';
      console.error('Stripe paymentIntents.create error:', stripeErr);
      return new Response(
        JSON.stringify({ error: message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const okStatuses = ['succeeded', 'requires_action', 'requires_capture'];
    if (!okStatuses.includes(paymentIntent.status)) {
      return new Response(
        JSON.stringify({ error: 'Payment failed', status: paymentIntent.status }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        id: paymentIntent.id,
        status: paymentIntent.status,
        client_secret: paymentIntent.client_secret,
        amount_cents: amountCents,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
