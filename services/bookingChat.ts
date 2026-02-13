import { supabase } from '../lib/supabase';

export interface BookingMessage {
  id: string;
  booking_id: string;
  sender_type: 'customer' | 'detailer';
  sender_id: string | null;
  body: string;
  created_at: string;
}

export async function fetchMessages(bookingId: string): Promise<BookingMessage[]> {
  const { data, error } = await supabase
    .from('booking_messages')
    .select('id, booking_id, sender_type, sender_id, body, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingMessage[];
}

export async function sendMessage(
  bookingId: string,
  senderType: 'customer' | 'detailer',
  body: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('booking_messages').insert({
    booking_id: bookingId,
    sender_type: senderType,
    sender_id: user?.id ?? null,
    body: body.trim(),
  });

  if (error) throw error;
}

export function subscribeToMessages(
  bookingId: string,
  onMessage: (msg: BookingMessage) => void
): () => void {
  const channel = supabase
    .channel(`booking_messages:${bookingId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_messages',
        filter: `booking_id=eq.${bookingId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        onMessage({
          id: row.id as string,
          booking_id: row.booking_id as string,
          sender_type: row.sender_type as 'customer' | 'detailer',
          sender_id: (row.sender_id as string) ?? null,
          body: row.body as string,
          created_at: row.created_at as string,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
