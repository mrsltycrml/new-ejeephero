-- Clerk identity mapping, Cloudflare R2 geometry URLs, automatic telemetry pruning, and 2-route setup

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clerk_id text UNIQUE;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS is_coming_soon boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS r2_geometry_url text;

CREATE OR REPLACE FUNCTION public.prune_old_vehicle_positions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.vehicle_positions
  WHERE "timestamp" < timezone('utc'::text, now()) - interval '24 hours';
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER vehicles_prune_old_telemetry
  AFTER INSERT ON public.vehicles
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prune_old_vehicle_positions();

REVOKE EXECUTE ON FUNCTION public.prune_old_vehicle_positions() FROM PUBLIC, anon, authenticated;

INSERT INTO public.routes (id, name, description, color_code, operating_hours, base_fare, per_km_rate, base_distance_km, fare_effective_date, fare_source_url, is_coming_soon)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440000',
    'Route 1: MRT Buendia - Mandaluyong City Hall',
    'Modernized & Electric PUJ Route connecting MRT Buendia Hub to Mandaluyong City Hall via Jupiter St, Makati Ave, Estrella-Pantaleon Bridge, and Maysilo Circle.',
    '#C41E3A',
    '06:00 AM - 10:00 PM',
    15.0,
    2.2,
    4.0,
    '2023-10-08',
    'https://ltfrb.gov.ph/',
    false
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    'Route 2: Ayala - Circuit Makati Loop (Coming Soon)',
    'Upcoming Makati eSakay electric jeepney loop connecting One Ayala Hub, Ayala Triangle, Makati City Hall, PRC Kalayaan, and Circuit Makati Transport Terminal.',
    '#203B53',
    'Coming Soon (5:00 AM - 10:00 PM)',
    15.0,
    2.2,
    4.0,
    '2023-10-08',
    'https://ltfrb.gov.ph/',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color_code = EXCLUDED.color_code,
  operating_hours = EXCLUDED.operating_hours,
  base_fare = EXCLUDED.base_fare,
  per_km_rate = EXCLUDED.per_km_rate,
  base_distance_km = EXCLUDED.base_distance_km,
  is_coming_soon = EXCLUDED.is_coming_soon;
