import { supabase } from '../lib/supabase';

export async function getDetailerEarnings(detailerId: string): Promise<{
  totalEarnings: number;
  totalJobs: number;
}> {
  const { data, error } = await supabase
    .from('detailer_bookings')
    .select('detailer_payout, cost, subtotal_cents')
    .eq('detailer_id', detailerId)
    .eq('status', 'completed');

  if (error || !data) {
    console.error('Failed to fetch detailer earnings:', error);
    return { totalEarnings: 0, totalJobs: 0 };
  }

  const totalEarnings = data.reduce((sum, job) => {
    const payout =
      job.detailer_payout ??
      (job.subtotal_cents != null ? (job.subtotal_cents / 100) * 0.8 : job.cost * 0.8);
    return sum + payout;
  }, 0);

  return {
    totalEarnings,
    totalJobs: data.length,
  };
}
