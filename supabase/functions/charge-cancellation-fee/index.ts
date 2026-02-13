// Supabase Edge Function: charge $25 cancellation fee when customer declines price adjustment.
// Updates the PaymentIntent amount to $25 and captures immediately.
// Set STRIPE_SECRET_KEY in Supabase project secrets.

import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  httpClient: Stripe.createFetchHttpClient(),
});

const CANCELLATION_FEE_CENTS = 2500; // $25

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
    const paymentIntentId = (body?.paymentIntentId as string)?.trim?.();

    if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid paymentIntentId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: row } = await supabase
      .from('detailer_bookings')
      .select('id, user_id, converted_user_id')
      .eq('payment_intent_id', paymentIntentId)
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ error: 'Booking not found for this payment' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isOwner =
      row.user_id === user.id || row.converted_user_id === user.id;
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'Not authorized to charge this payment' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'requires_capture') {
      return new Response(
        JSON.stringify({ error: 'Payment is not in a capturable state' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await stripe.paymentIntents.capture(paymentIntentId, {
      amount_to_capture: CANCELLATION_FEE_CENTS,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Charge failed';
    console.error('charge-cancellation-fee error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
