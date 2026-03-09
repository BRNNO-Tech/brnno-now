import { supabase } from './supabase';

/** Max number of saved addresses shown in the address step (most recent first). */
const SAVED_ADDRESSES_LIMIT = 3;

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  address_zip: string | null;
  lat: number | null;
  lng: number | null;
}

export async function getSavedAddresses(userId: string): Promise<SavedAddress[]> {
  const { data, error } = await supabase
    .from('saved_addresses')
    .select('id, label, address, address_zip, lat, lng')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(SAVED_ADDRESSES_LIMIT);
  if (error) {
    // Table may not exist yet (run supabase/saved_addresses.sql); avoid breaking checkout
    console.warn('[saved_addresses]', error.message);
    return [];
  }
  return data ?? [];
}

export async function addSavedAddress(
  userId: string,
  address: { label: string; address: string; address_zip?: string | null; lat?: number | null; lng?: number | null }
): Promise<SavedAddress> {
  const { data, error } = await supabase
    .from('saved_addresses')
    .insert({ user_id: userId, ...address })
    .select('id, label, address, address_zip, lat, lng')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSavedAddress(id: string): Promise<void> {
  const { error } = await supabase.from('saved_addresses').delete().eq('id', id);
  if (error) throw error;
}
