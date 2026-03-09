import { supabase } from '../lib/supabase';

/** Charge a tip for a booking (Stripe). Call before submitBookingReview when tip > 0. */
export async function chargeTipForBooking(bookingId: string, tipAmountCents: number): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in to add a tip.');
  const { data, error } = await supabase.functions.invoke('charge-tip-for-booking', {
    body: { booking_id: bookingId, tip_amount_cents: tipAmountCents },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    const err = error as { context?: { json?: () => Promise<{ error?: string }> } };
    if (typeof err.context?.json === 'function') {
      try {
        const body = await err.context.json();
        if (body?.error) throw new Error(body.error);
      } catch (e) {
        if (e instanceof Error) throw e;
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Tip charge failed');
}

export interface SubmitReviewParams {
  bookingId: string;
  detailerId: string;
  rating: number;
  reviewText?: string | null;
  tipAmountCents: number;
}

/** Insert a review for a booking. Call after optional tip charge. RLS: user_id = auth.uid(). */
export async function submitBookingReview(params: SubmitReviewParams): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in to submit a review.');

  const { error } = await supabase.from('booking_reviews').insert({
    booking_id: params.bookingId,
    user_id: user.id,
    detailer_id: params.detailerId,
    rating: params.rating,
    review_text: params.reviewText?.trim() || null,
    tip_amount: params.tipAmountCents,
  });

  if (error) {
    const code = String(error.code ?? '');
    const status = (error as { status?: number }).status;
    const msg = (error.message ?? '').toLowerCase();
    const isTableMissing =
      status === 404 ||
      code === 'PGRST116' ||
      code === '42P01' ||
      code === '404' ||
      msg.includes('404') ||
      msg.includes('not found') ||
      msg.includes('relation') ||
      msg.includes('does not exist');
    if (isTableMissing) return;
    throw error;
  }
}

/** Get review for a single booking, if any. */
export async function getReviewForBooking(bookingId: string): Promise<{ rating: number; review_text: string | null } | null> {
  const { data, error } = await supabase
    .from('booking_reviews')
    .select('rating, review_text')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (error) throw error;
  return data as { rating: number; review_text: string | null } | null;
}

/** Get reviews for multiple bookings (e.g. for history list). Returns map of booking_id -> { rating, review_text }. */
export async function getReviewsByBookingIds(
  bookingIds: string[]
): Promise<Map<string, { rating: number; review_text: string | null }>> {
  if (bookingIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('booking_reviews')
    .select('booking_id, rating, review_text')
    .in('booking_id', bookingIds);

  if (error) {
    const code = String(error.code ?? '');
    const msg = (error.message ?? '').toLowerCase();
    if (code === 'PGRST116' || code === '42P01' || msg.includes('404') || msg.includes('not found')) {
      return new Map();
    }
    throw error;
  }
  const map = new Map<string, { rating: number; review_text: string | null }>();
  (data ?? []).forEach((row: { booking_id: string; rating: number; review_text: string | null }) => {
    map.set(row.booking_id, { rating: row.rating, review_text: row.review_text });
  });
  return map;
}

export interface RecentReviewForDetailer {
  id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  service_name: string;
  car_name: string | null;
}

/** Last N reviews for a detailer (for dashboard Recent Reviews). Fetches reviews then booking details. */
export async function getRecentReviewsForDetailer(
  detailerId: string,
  limit = 5
): Promise<RecentReviewForDetailer[]> {
  const { data: rows, error } = await supabase
    .from('booking_reviews')
    .select('id, booking_id, rating, review_text, created_at')
    .eq('detailer_id', detailerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!rows?.length) return [];

  const bookingIds = rows.map((r: { booking_id: string }) => r.booking_id);
  const { data: bookings } = await supabase
    .from('detailer_bookings')
    .select('id, service_name, car_name')
    .in('id', bookingIds);

  const bookingMap = new Map<string, { service_name: string; car_name: string | null }>();
  (bookings ?? []).forEach((b: { id: string; service_name: string; car_name: string | null }) => {
    bookingMap.set(b.id, { service_name: b.service_name, car_name: b.car_name });
  });

  return rows.map((row: { id: string; booking_id: string; rating: number; review_text: string | null; created_at: string }) => {
    const b = bookingMap.get(row.booking_id);
    return {
      id: row.id,
      rating: row.rating,
      review_text: row.review_text,
      created_at: row.created_at,
      service_name: b?.service_name ?? '—',
      car_name: b?.car_name ?? null,
    };
  });
}
