import { supabase } from '../lib/supabase';

export async function updateDetailerLocation(
  detailerId: string,
  lat: number,
  lng: number
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('detailers')
    .update({
      current_lat: lat,
      current_lng: lng,
      location_updated_at: new Date().toISOString(),
    })
    .eq('id', detailerId);

  if (error) {
    console.error('Failed to update detailer location:', error);
    return { error: error as unknown as Error };
  }

  return { error: null };
}

export async function getDetailerLocation(detailerId: string): Promise<{
  lat: number;
  lng: number;
  updated_at: string;
} | null> {
  const { data, error } = await supabase
    .from('detailers')
    .select('current_lat, current_lng, location_updated_at')
    .eq('id', detailerId)
    .maybeSingle();

  if (error || !data?.current_lat || !data?.current_lng) {
    return null;
  }

  return {
    lat: data.current_lat as number,
    lng: data.current_lng as number,
    updated_at: (data.location_updated_at as string) ?? new Date().toISOString(),
  };
}
