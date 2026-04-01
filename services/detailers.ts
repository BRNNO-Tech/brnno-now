import { supabase } from '../lib/supabase';
import type { VehicleEntry } from './bookings';

export interface DetailerProfile {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  phone: string;
  profile_photo_url: string | null;
  service_areas: string[] | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  is_online: boolean;
  is_approved: boolean;
  status: string;
  stripe_connect_account_id: string | null;
  stripe_connect_completed: boolean;
  rating: number;
  total_completed_jobs: number;
  total_earnings: number;
  created_at: string;
  updated_at: string;
}

export interface AvailableJob {
  id: string;
  service_name: string;
  cost: number;
  location: string | null;
  address_zip: string | null;
  created_at: string;
  /** Pre-tax amount (cents); use for payout so tax is not paid to detailer. */
  subtotal_cents: number | null;
  add_ons: string[] | null;
  dirtiness_level: string | null;
  vehicles?: VehicleEntry[] | null;
}

export async function getDetailerByAuthUserId(authUserId: string): Promise<DetailerProfile | null> {
  const { data, error } = await supabase
    .from('detailers')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as DetailerProfile;
}

export async function updateDetailerOnline(id: string, isOnline: boolean): Promise<void> {
  const payload: { is_online: boolean; updated_at: string; current_lat?: null; current_lng?: null } = {
    is_online: isOnline,
    updated_at: new Date().toISOString(),
  };
  // When going offline, clear location so customer map stops showing the detailer's marker
  if (!isOnline) {
    payload.current_lat = null;
    payload.current_lng = null;
  }
  const { error } = await supabase
    .from('detailers')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
}

export async function listAvailableJobsForDetailer(
  _detailerId: string,
  _serviceAreas: string[] | null
): Promise<AvailableJob[]> {
  const { data, error } = await supabase.rpc('get_pending_bookings_for_detailer');
  if (!error && data != null) {
    return data as AvailableJob[];
  }
  if (error) {
    console.warn('[detailers] get_pending_bookings_for_detailer RPC failed — run migrations or check grants:', error.message);
  }

  const { data: rows, error: qErr } = await supabase
    .from('detailer_bookings')
    .select('id, service_name, cost, location, address_zip, created_at, subtotal_cents, add_ons, dirtiness_level, vehicles')
    .eq('status', 'pending')
    .is('detailer_id', null)
    .order('created_at', { ascending: false });

  if (qErr) throw qErr;
  return (rows ?? []) as AvailableJob[];
}

export async function acceptJob(bookingId: string, detailer: DetailerProfile): Promise<void> {
  const detailerVehicle =
    [detailer.vehicle_year, detailer.vehicle_make, detailer.vehicle_model]
      .filter(Boolean)
      .join(' ') || 'Pro vehicle';

  const { error } = await supabase
    .from('detailer_bookings')
    .update({
      detailer_id: detailer.id,
      detailer_name: detailer.name,
      detailer_vehicle: detailerVehicle,
      status: 'assigned',
      detailer_assigned_at: new Date().toISOString(),
      detailer_accepted_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('status', 'pending');

  if (error) throw error;
}

/** Row shape for active jobs and job details (detailer_bookings). */
export interface ActiveJobRow {
  id: string;
  user_id: string;
  service_name: string;
  cost: number;
  status: string;
  detailer_id: string | null;
  detailer_name: string | null;
  car_name: string | null;
  detailer_vehicle: string | null;
  vehicles?: VehicleEntry[] | null;
  location: string | null;
  address_zip: string | null;
  detailer_assigned_at: string | null;
  detailer_accepted_at: string | null;
  detailer_arrived_at: string | null;
  detailer_completed_at: string | null;
  detailer_payout: number | null;
  commission_rate: number | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  completed_at: string | null;
  created_at: string;
  add_ons: string[] | null;
  dirtiness_level: string | null;
  is_guest?: boolean;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  assigned_detailer_id?: string | null;
  payment_intent_id?: string | null;
  adjusted_price?: number | null;
  adjustment_reason?: string | null;
  customer_approved_adjustment?: boolean | null;
  [key: string]: unknown;
}

/** Price to show for a job (agreed amount when customer approved an adjustment, otherwise cost). */
export function getJobDisplayPrice(job: ActiveJobRow): number {
  if (job.customer_approved_adjustment && job.adjusted_price != null && job.adjusted_price > 0) {
    return job.adjusted_price / 100;
  }
  return Number(job.cost);
}

const ACTIVE_JOB_STATUSES = ['assigned', 'en_route', 'in_progress', 'pending_approval'] as const;

export async function getActiveJobsForDetailer(detailerId: string): Promise<ActiveJobRow[]> {
  const { data, error } = await supabase
    .from('detailer_bookings')
    .select('*')
    .or(`assigned_detailer_id.eq.${detailerId},detailer_id.eq.${detailerId}`)
    .in('status', [...ACTIVE_JOB_STATUSES])
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ActiveJobRow[];
}

/** Completed jobs for the detailer (for history / completed tab). */
export async function getCompletedJobsForDetailer(detailerId: string): Promise<ActiveJobRow[]> {
  const { data, error } = await supabase
    .from('detailer_bookings')
    .select('*')
    .or(`assigned_detailer_id.eq.${detailerId},detailer_id.eq.${detailerId}`)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ActiveJobRow[];
}

export type JobStatusUpdate = 'assigned' | 'in_progress' | 'completed';

export async function updateJobStatus(
  jobId: string,
  status: JobStatusUpdate,
  detailerId: string
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (status === 'in_progress') {
    updates.detailer_arrived_at = new Date().toISOString();
  }

  if (status === 'completed') {
    updates.detailer_completed_at = new Date().toISOString();
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('detailer_bookings')
    .update(updates)
    .eq('id', jobId)
    .or(`detailer_id.eq.${detailerId},assigned_detailer_id.eq.${detailerId}`);

  if (error) throw error;
}

export async function getJobDetails(jobId: string): Promise<ActiveJobRow | null> {
  const { data, error } = await supabase
    .from('detailer_bookings')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  return data as ActiveJobRow | null;
}
