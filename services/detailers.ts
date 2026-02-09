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
    .select('id, service_name, cost, location, address_zip, created_at')
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
