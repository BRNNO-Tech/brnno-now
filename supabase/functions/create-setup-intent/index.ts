// Supabase Edge Function: create a Stripe SetupIntent for saving a new card.
// Set STRIPE_SECRET_KEY in Supabase project secrets.
//
// Setup Intent = "Save this card for later" — NO charge, NO dollar amount.
// It does not show in Stripe Payments tab; it appears under Setup Intents / API logs.
// Payment Intent (create-payment-intent) = "Charge me $X now" — shows amount in Payments.

import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  httpClient: Stripe.createFetchHttpClient(),
});

// Mandatory for Vite/localhost: browser preflight OPTIONS must get these headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle preflight so Vite on localhost can call this function
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

    let stripeCustomerId: string | null = null;
    const { data: existing } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (existing?.stripe_customer_id) {
      stripeCustomerId = existing.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await supabase.from('stripe_customers').insert({
        user_id: user.id,
        stripe_customer_id: customer.id,
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session',
    });

    return new Response(
      JSON.stringify({ client_secret: setupIntent.client_secret }),
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
