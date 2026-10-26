-- Fix legacy permissive RLS policies, sync profile approval flags, and add missing vehicle_positions.updated_at

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS botpress_user_key text,
  ADD COLUMN IF NOT EXISTS botpress_conversation_id text;

UPDATE public.profiles
SET is_approved = (status = 'approved' OR is_admin = true)
WHERE id IS NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('passenger', 'driver', 'supervisor', 'admin'));

ALTER TABLE public.vehicle_positions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle_updated
  ON public.vehicle_positions (vehicle_id, updated_at DESC);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

REVOKE EXECUTE ON FUNCTION public.handle_ejeephero_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.suspend_after_confirmed_trip_violations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_incomplete_driver_route() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_speeding_position() FROM PUBLIC, anon, authenticated;
