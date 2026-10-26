-- Allow both Clerk-authenticated users and legacy Supabase Auth users to coexist cleanly in public.profiles and public.emergency_contacts

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.emergency_contacts DROP CONSTRAINT IF EXISTS emergency_contacts_user_id_fkey;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['passenger'::text, 'driver'::text, 'supervisor'::text, 'admin'::text]));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'suspended'::text]));

CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON public.profiles (LOWER(email));

CREATE OR REPLACE FUNCTION public.enforce_profile_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF new.status IS DISTINCT FROM old.status THEN
    new.is_approved := (new.status = 'approved');
  ELSIF new.is_approved IS DISTINCT FROM old.is_approved THEN
    new.status := CASE WHEN new.is_approved THEN 'approved' ELSE 'rejected' END;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN new;
  END IF;

  IF public.check_is_admin(auth.uid()) THEN
    RETURN new;
  END IF;

  IF new.role IS DISTINCT FROM old.role OR new.is_approved IS DISTINCT FROM old.is_approved OR new.status IS DISTINCT FROM old.status OR new.is_admin IS DISTINCT FROM old.is_admin THEN
    RAISE EXCEPTION 'Only approved supervisors or administrators may change role or approval state.';
  END IF;

  RETURN new;
END;
$$;
