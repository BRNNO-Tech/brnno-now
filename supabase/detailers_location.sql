-- Add location tracking to detailers table (run in Supabase SQL Editor)
-- Run after detailers table exists.

ALTER TABLE public.detailers
ADD COLUMN IF NOT EXISTS current_lat double precision,
ADD COLUMN IF NOT EXISTS current_lng double precision,
ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

-- Index for lookups (optional; id is already primary key)
CREATE INDEX IF NOT EXISTS idx_detailers_location_updated
ON public.detailers(id, location_updated_at);

-- Customers need to read detailer location when they have an active booking
CREATE POLICY "Customers can view detailer location for assigned bookings"
ON public.detailers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.detailer_bookings b
    WHERE b.detailer_id = detailers.id
    AND b.status IN ('assigned', 'in_progress')
    AND (b.user_id = auth.uid() OR b.converted_user_id = auth.uid())
  )
);
