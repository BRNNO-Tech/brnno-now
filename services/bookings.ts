import { supabase } from '../lib/supabase';
import type { PastBooking } from '../types';

export type BookingDbStatus = 'pending' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled';

export interface BookingRow {
  id: string;
  user_id: string | null;
  service_name: string;
  cost: number;
  status: BookingDbStatus;
  detailer_id: string | null;
  detailer_name: string | null;
  car_name: string | null;
  location: string | null;
  address_zip: string | null;
  completed_at: string | null;
  created_at: string;
  payment_intent_id: string | null;
  tax_cents: number | null;
  subtotal_cents: number | null;
  is_guest?: boolean;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  converted_user_id?: string | null;
}

function formatBookingDate(completedAt: string | null, createdAt: string): string {
  const d = completedAt ? new Date(completedAt) : new Date(createdAt);
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date} • ${time}`;
}

function dbStatusToDisplay(status: BookingDbStatus): PastBooking['status'] {
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return 'In progress';
}

function rowToPastBooking(row: BookingRow): PastBooking {
  return {
    id: row.id,
    serviceName: row.service_name,
    date: formatBookingDate(row.completed_at, row.created_at),
    cost: Number(row.cost),
    status: dbStatusToDisplay(row.status),
    detailerName: row.detailer_name ?? '—',
    carName: row.car_name ?? '—',
    location: row.location ?? '',
  };
}

export interface CreateBookingParams {
  userId: string | null;
  serviceName: string;
  cost: number;
  detailerName: string | null;
  carName: string | null;
  location?: string;
  addressZip: string | null;
  status?: 'pending' | 'en_route';
  payment_intent_id: string | null;
  tax_cents: number | null;
  subtotal_cents: number | null;
  add_ons: string[] | null;
  dirtiness_level: string | null;
  is_guest?: boolean;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
}

export async function createBooking(params: CreateBookingParams): Promise<{ id: string }> {
  const status = params.status ?? 'pending';
  const { data, error } = await supabase
    .from('detailer_bookings')
    .insert({
      user_id: params.userId ?? null,
      service_name: params.serviceName,
      cost: params.cost,
      status,
      detailer_name: params.detailerName ?? null,
      car_name: params.carName ?? null,
      location: params.location ?? 'At your location',
      address_zip: params.addressZip ?? null,
      payment_intent_id: params.payment_intent_id ?? null,
      tax_cents: params.tax_cents ?? null,
      subtotal_cents: params.subtotal_cents ?? null,
      add_ons: params.add_ons ?? null,
      dirtiness_level: params.dirtiness_level ?? null,
      is_guest: params.is_guest ?? false,
      guest_name: params.guest_name ?? null,
      guest_email: params.guest_email ?? null,
      guest_phone: params.guest_phone ?? null,
    })
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('No id returned from createBooking');
  return { id: data.id };
}

export async function getBookingById(bookingId: string): Promise<BookingRow | null> {
  const { data, error } = await supabase
    .from('detailer_bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throw error;
  return data as BookingRow | null;
}

export async function listBookingsByUser(userId: string): Promise<PastBooking[]> {
  const { data, error } = await supabase
    .from('detailer_bookings')
    .select('*')
    .or(`user_id.eq.${userId},converted_user_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as BookingRow[]).map(rowToPastBooking);
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingDbStatus
): Promise<void> {
  const updates: { status: BookingDbStatus; completed_at?: string } = {
    status,
  };
  if (status === 'completed' || status === 'cancelled') {
    updates.completed_at = new Date().toISOString();
  }
  const { error } = await supabase.from('detailer_bookings').update(updates).eq('id', bookingId);
  if (error) throw error;
}

/** Cancel a booking via handle-cancellation (tiered fee or full void). Call when user owns the booking. */
export async function cancelBooking(bookingId: string): Promise<{ cancelled: boolean; fee_cents: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Please log in to cancel.');
  }
  const { data, error } = await supabase.functions.invoke('handle-cancellation', {
    body: { booking_id: bookingId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Cancel failed');
  return data as { cancelled: boolean; fee_cents: number };
}
