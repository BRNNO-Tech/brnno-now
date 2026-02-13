import { supabase } from '../lib/supabase';

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
  const { error } = await supabase
    .from('detailers')
    .update({
      is_online: isOnline,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

export async function listAvailableJobsForDetailer(
  _detailerId: string,
  serviceAreas: string[] | null
): Promise<AvailableJob[]> {
  const { data, error } = await supabase
    .from('detailer_bookings')
    .select('id, service_name, cost, location, address_zip, created_at, subtotal_cents, add_ons, dirtiness_level')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as AvailableJob[];
  if (serviceAreas && serviceAreas.length > 0) {
    return rows.filter(
      (job) => !job.address_zip || serviceAreas.includes(job.address_zip)
    );
  }
  return rows;
}

export async function acceptJob(bookingId: string, detailer: DetailerProfile): Promise<void> {
  const carName = [detailer.vehicle_year, detailer.vehicle_make, detailer.vehicle_model]
    .filter(Boolean)
    .join(' ') || 'Pro vehicle';

  const { error } = await supabase
    .from('detailer_bookings')
    .update({
      detailer_id: detailer.id,
      detailer_name: detailer.name,
      car_name: carName,
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
  [key: string]: unknown;
}

export async function getActiveJobsForDetailer(detailerId: string): Promise<ActiveJobRow[]> {
  const { data, error } = await supabase
    .from('detailer_bookings')
    .select('*')
    .or(`assigned_detailer_id.eq.${detailerId},detailer_id.eq.${detailerId}`)
    .in('status', ['assigned', 'en_route', 'in_progress', 'completed', 'pending_approval'])
    .order('created_at', { ascending: false });

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
