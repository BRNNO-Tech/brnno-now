// Supabase Edge Function: capture payment when detailer marks job complete.
// Allows detailers (who cannot use capture-payment, which requires customer auth) to trigger capture.
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
    const bookingId = (body?.booking_id as string)?.trim?.();

    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'Missing booking_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: detailer } = await supabase
      .from('detailers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!detailer) {
      return new Response(JSON.stringify({ error: 'Not a detailer' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: row } = await supabase
      .from('detailer_bookings')
      .select('id, payment_intent_id, detailer_id, assigned_detailer_id')
      .eq('id', bookingId)
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isAssignedDetailer =
      row.detailer_id === detailer.id || row.assigned_detailer_id === detailer.id;
    if (!isAssignedDetailer) {
      return new Response(JSON.stringify({ error: 'Not assigned to this job' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentIntentId = (row as { payment_intent_id?: string | null }).payment_intent_id;
    if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
      return new Response(
        JSON.stringify({ success: true, captured: false, message: 'No payment to capture' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'requires_capture') {
      return new Response(
        JSON.stringify({ success: true, captured: false, message: 'Payment already captured or not capturable' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const captured = await stripe.paymentIntents.capture(paymentIntentId);

    return new Response(
      JSON.stringify({ success: true, captured: true, id: captured.id, status: captured.status }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Capture failed';
    console.error('capture-payment-for-job error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
