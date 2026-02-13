// Supabase Edge Function: update PaymentIntent amount before capture.
// Used when customer approves a price adjustment. Stripe allows amount updates only
// when PI status is requires_confirmation or requires_payment_method; if already
// authorized (requires_capture), this will fail - caller should handle that.
// Set STRIPE_SECRET_KEY in Supabase project secrets.

import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const paymentIntentId = (body?.paymentIntentId as string)?.trim?.();
    const newAmount = Math.round(Number(body?.newAmount ?? 0));

    if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid paymentIntentId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Number.isFinite(newAmount) || newAmount < 50) {
      return new Response(JSON.stringify({ error: 'Invalid newAmount (min 50 cents)' }), {
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
      return new Response(JSON.stringify({ error: 'Not authorized to update this payment' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await stripe.paymentIntents.update(paymentIntentId, { amount: newAmount });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Update failed';
    console.error('update-payment-amount error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
