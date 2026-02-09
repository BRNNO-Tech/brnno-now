// Supabase Edge Function: cancel (void) a previously authorized PaymentIntent (release the hold).
// Set STRIPE_SECRET_KEY in Supabase project secrets.
// Call when the user cancels before a detailer accepts, or when search times out.

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
    const paymentIntentId = (body?.payment_intent_id as string)?.trim();
    if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid payment_intent_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const metadataUserId = pi.metadata?.supabase_user_id;
    if (metadataUserId && metadataUserId !== user.id) {
      return new Response(JSON.stringify({ error: 'Payment intent does not belong to this user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cancelled = await stripe.paymentIntents.cancel(paymentIntentId);

    return new Response(
      JSON.stringify({ id: cancelled.id, status: cancelled.status }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cancel failed';
    console.error('cancel-payment error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
