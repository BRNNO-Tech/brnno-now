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
    return new Response(null, { status: 204, headers: corsHeaders });
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

    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: { paymentIntentId?: unknown; newAmount?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
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

    try {
      await stripe.paymentIntents.update(paymentIntentId, { amount: newAmount });
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (updateErr: unknown) {
      const msg = updateErr instanceof Error ? updateErr.message : '';
      if (msg.includes('requires_capture') && msg.includes('amount could not be updated')) {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const authorizedAmount = pi.amount ?? 0;
        if (newAmount <= authorizedAmount) {
          return new Response(
            JSON.stringify({ success: true, already_authorized: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const pmId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id;
        if (!pmId) {
          return new Response(
            JSON.stringify({ error: 'Could not get payment method to charge adjusted amount' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null;
        const newPiParams: Stripe.PaymentIntentCreateParams = {
          amount: newAmount,
          currency: 'usd',
          payment_method: pmId,
          confirm: true,
          metadata: { type: 'price_adjustment', original_pi: paymentIntentId },
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        };
        if (customerId) newPiParams.customer = customerId;
        const newPi = await stripe.paymentIntents.create(newPiParams);
        let finalPi = newPi;
        if (newPi.status === 'requires_capture') {
          finalPi = await stripe.paymentIntents.capture(newPi.id);
        }
        if (finalPi.status !== 'succeeded') {
          return new Response(
            JSON.stringify({ error: 'Adjusted amount could not be charged', status: finalPi.status }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        await stripe.paymentIntents.cancel(paymentIntentId);
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (serviceRoleKey) {
          const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);
          await admin.from('detailer_bookings').update({ payment_intent_id: newPi.id }).eq('id', (row as { id: string }).id);
        }
        return new Response(
          JSON.stringify({ success: true, charged_adjusted_amount: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw updateErr;
    }
  } catch (err: unknown) {
    let message = 'Update failed';
    if (err instanceof Error) message = err.message;
    if (err && typeof (err as { raw?: { message?: string } }).raw?.message === 'string') {
      message = (err as { raw: { message: string } }).raw.message;
    }
    console.error('update-payment-amount error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
