// Supabase Edge Function: cancel a booking with tiered cancellation fees.
// If no detailer accepted yet: full void (release hold). If accepted: fee by time since acceptance.
// Set STRIPE_SECRET_KEY in Supabase project secrets.
// After partial capture, Stripe releases the remaining authorized amount automatically.

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

const CANCELLABLE_STATUSES = ['pending', 'assigned', 'en_route'];

// Fee schedule: under 2 min $0; 2–5 min $5 (500 cents); over 5 min $10 (1000 cents)
function feeCentsFromAcceptedAt(detailerAcceptedAt: string): number {
  const accepted = new Date(detailerAcceptedAt).getTime();
  const now = Date.now();
  const minutes = (now - accepted) / (60 * 1000);
  if (minutes < 2) return 0;
  if (minutes <= 5) return 500;
  return 1000;
}

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
    const bookingId = (body?.booking_id as string)?.trim();
    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'Missing booking_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: row, error: fetchError } = await supabase
      .from('detailer_bookings')
      .select('id, user_id, payment_intent_id, detailer_accepted_at, status')
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!row) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!CANCELLABLE_STATUSES.includes(row.status as string)) {
      return new Response(JSON.stringify({ error: 'Booking cannot be cancelled' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let feeCents = 0;

    if (row.payment_intent_id && String(row.payment_intent_id).startsWith('pi_')) {
      const pi = await stripe.paymentIntents.retrieve(row.payment_intent_id);
      const metadataUserId = pi.metadata?.supabase_user_id;
      if (metadataUserId && metadataUserId !== user.id) {
        return new Response(JSON.stringify({ error: 'Payment intent does not belong to this user' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (row.detailer_accepted_at) {
        feeCents = feeCentsFromAcceptedAt(row.detailer_accepted_at);
        if (feeCents > 0) {
          await stripe.paymentIntents.capture(row.payment_intent_id, {
            amount_to_capture: feeCents,
          });
        } else {
          await stripe.paymentIntents.cancel(row.payment_intent_id);
        }
      } else {
        await stripe.paymentIntents.cancel(row.payment_intent_id);
      }
    }

    const { error: updateError } = await supabase
      .from('detailer_bookings')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('user_id', user.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ cancelled: true, fee_cents: feeCents }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cancellation failed';
    console.error('handle-cancellation error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
