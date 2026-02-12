-- Fix 500 error: circular RLS between detailers and detailer_bookings.
-- The "Customers can view detailer location" policy queried detailer_bookings,
-- which triggered detailer_bookings RLS, which queried detailers again (loop).

-- Drop the problematic policy
DROP POLICY IF EXISTS "Customers can view detailer location for assigned bookings" ON public.detailers;

-- SECURITY DEFINER bypasses RLS, breaking the cycle
CREATE OR REPLACE FUNCTION public.user_has_active_booking_with_detailer(p_user_id uuid, p_detailer_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.detailer_bookings b
    WHERE b.detailer_id = p_detailer_id
    AND b.status IN ('assigned', 'in_progress')
    AND (b.user_id = p_user_id OR b.converted_user_id = p_user_id)
  );
$$;

-- Re-create policy using the function (no cross-table RLS recursion)
CREATE POLICY "Customers can view detailer location for assigned bookings"
ON public.detailers FOR SELECT
USING (
  public.user_has_active_booking_with_detailer(auth.uid(), id)
);
