-- Account access no longer depends on an administrator approval queue.
-- Supabase Auth still requires email confirmation before a user can sign in.

CREATE OR REPLACE FUNCTION public.handle_ejeephero_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status, is_approved, full_name)
  VALUES (
    new.id,
    new.email,
    CASE WHEN new.raw_user_meta_data->>'role' = 'driver' THEN 'driver' ELSE 'passenger' END,
    'approved',
    true,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- Release accounts that were waiting in the former approval queue, but only
-- when their authentication provider has already confirmed the email address.
UPDATE public.profiles AS profile
SET status = 'approved', is_approved = true
WHERE profile.status = 'pending'
  AND profile.role IN ('passenger', 'driver')
  AND (
    profile.clerk_id IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM auth.users AS account
      WHERE account.id = profile.id
        AND account.email_confirmed_at IS NOT NULL
    )
  );
