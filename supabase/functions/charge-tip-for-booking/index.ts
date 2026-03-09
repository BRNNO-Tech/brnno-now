// Supabase Edge Function: charge a tip for a completed booking using the same payment method.
// Customer auth required. Stripe: retrieve original PaymentIntent, get payment_method, create new PI for tip and capture.
// Set STRIPE_SECRET_KEY in Supabase project secrets.

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

// @ts-expect-error - Deno URL import
import Stripe from 'https://esm.sh/stripe@14?target=denonext';
// @ts-expect-error - Deno URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getStripe(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token', details: userError?.message ?? 'getUser failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body: { booking_id?: unknown; tip_amount_cents?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const bookingId = (body?.booking_id as string)?.trim?.();
    const tipAmountCents = Math.floor(Number(body?.tip_amount_cents ?? 0));

    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'Missing booking_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (tipAmountCents < 50) {
      return new Response(JSON.stringify({ error: 'Tip must be at least 50 cents' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // RLS: only customer's own bookings are visible
    const { data: row, error: rowError } = await supabase
      .from('detailer_bookings')
      .select('id, payment_intent_id, detailer_id, user_id, converted_user_id')
      .eq('id', bookingId)
      .maybeSingle();

    if (rowError || !row) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const uid = user.id;
    const isOwner = (row.user_id && row.user_id === uid) || (row.converted_user_id && row.converted_user_id === uid);
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'Not your booking' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Idempotency: already has a review for this booking => do not charge again (ignore if table missing)
    const { data: existing } = await supabase
      .from('booking_reviews')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (existing) {
      return new Response(
        JSON.stringify({ error: 'This booking has already been reviewed and cannot accept another tip charge.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paymentIntentId = (row as { payment_intent_id?: string | null }).payment_intent_id;
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return new Response(JSON.stringify({ error: 'Booking has no payment to use for tip' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const pmId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id;
    if (!pmId) {
      return new Response(JSON.stringify({ error: 'Could not get payment method from booking' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null;

    const tipPiParams: Stripe.PaymentIntentCreateParams = {
      amount: tipAmountCents,
      currency: 'usd',
      payment_method: pmId,
      confirm: true,
      metadata: { booking_id: bookingId, type: 'tip' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    };
    if (customerId) tipPiParams.customer = customerId;

    const tipPi = await stripe.paymentIntents.create(tipPiParams);
    if (tipPi.status !== 'succeeded' && tipPi.status !== 'requires_capture') {
      return new Response(
        JSON.stringify({ error: 'Tip charge could not be completed', status: tipPi.status }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateErr } = await supabase
      .from('detailer_bookings')
      .update({ tip_amount: tipAmountCents })
      .eq('id', bookingId);

    if (updateErr) {
      console.error('Failed to update booking tip_amount:', updateErr);
      return new Response(
        JSON.stringify({ success: true, tip_amount_cents: tipAmountCents, tip_saved: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, tip_amount_cents: tipAmountCents }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    let message = err instanceof Error ? err.message : 'Tip charge failed';
    if (err && typeof (err as { raw?: { message?: string } }).raw?.message === 'string') {
      message = (err as { raw: { message: string } }).raw.message;
    }
    console.error('charge-tip-for-booking error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
