// Supabase Edge Function: save a Stripe Payment Method to DB after client-side confirmCardSetup.
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
    const paymentMethodId = body?.payment_method_id as string;
    if (!paymentMethodId || !paymentMethodId.startsWith('pm_')) {
      return new Response(JSON.stringify({ error: 'Invalid payment_method_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.type !== 'card' || !pm.card) {
      return new Response(JSON.stringify({ error: 'Not a card payment method' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { count } = await supabase
      .from('payment_methods')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const isDefault = (count ?? 0) === 0;

    const { data: row, error: insertError } = await supabase
      .from('payment_methods')
      .insert({
        user_id: user.id,
        stripe_payment_method_id: pm.id,
        stripe_customer_id: pm.customer ?? null,
        last4: pm.card.last4,
        brand: pm.card.brand,
        expiry_month: pm.card.exp_month,
        expiry_year: pm.card.exp_year,
        is_default: isDefault,
      })
      .select('id, stripe_payment_method_id, last4, brand, expiry_month, expiry_year, is_default')
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(row), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
