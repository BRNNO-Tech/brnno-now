import { supabase } from '../lib/supabase';

/**
 * Submit job completion checklist. Call before capture + updateJobStatus(completed).
 * RLS: detailer can insert their own.
 */
export async function submitJobChecklist(
  bookingId: string,
  detailerId: string,
  completedItems: string[]
): Promise<void> {
  const { error } = await supabase.from('job_checklists').insert({
    booking_id: bookingId,
    detailer_id: detailerId,
    completed_items: completedItems,
    submitted_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Get submitted checklist for a booking (e.g. for admin booking detail).
 * RLS: detailer sees own; admin sees all.
 */
export async function getChecklistForBooking(
  bookingId: string
): Promise<{ completed_items: string[]; submitted_at: string } | null> {
  const { data, error } = await supabase
    .from('job_checklists')
    .select('completed_items, submitted_at')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    completed_items: (data.completed_items as string[]) ?? [],
    submitted_at: data.submitted_at as string,
  };
}
