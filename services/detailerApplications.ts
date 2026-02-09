import { supabase } from '../lib/supabase';

export interface DetailerApplicationInput {
  full_name: string;
  email: string;
  phone: string;
  business_name: string;
  ein: string;
  business_type: string;
  dba?: string;
  business_street?: string;
  business_city?: string;
  business_state?: string;
  business_zip?: string;
  vehicle_type?: string;
  service_area?: string;
  message?: string;
  user_id?: string | null;
}

export async function submitDetailerApplication(
  input: DetailerApplicationInput
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('detailer_applications').insert({
    full_name: input.full_name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    business_name: input.business_name.trim(),
    ein: input.ein.trim(),
    business_type: input.business_type.trim(),
    dba: input.dba?.trim() || null,
    business_street: input.business_street?.trim() || null,
    business_city: input.business_city?.trim() || null,
    business_state: input.business_state?.trim() || null,
    business_zip: input.business_zip?.trim() || null,
    vehicle_type: input.vehicle_type?.trim() || null,
    service_area: input.service_area?.trim() || null,
    message: input.message?.trim() || null,
    user_id: input.user_id || null,
  });
  return { error: error ?? null };
}
