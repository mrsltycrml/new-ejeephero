-- eSAKAY operator-reported plan; do not attribute these numbers to LTFRB.
-- Fare estimates remain disabled until posted fare evidence and road distance
-- are checked. The old route geometry has no verified source.
update public.routes
set operating_hours = '4:00 AM–12:00 AM',
    base_fare = 15,
    per_km_rate = 1,
    base_distance_km = 4,
    fare_effective_date = null,
    fare_source_url = null,
    description = 'MRT Buendia to Mandaluyong City Hall. Road alignment and boarding points are under review.',
    r2_geometry_url = null,
    geometry_verified_at = null,
    geometry_source_url = null
where id = '550e8400-e29b-41d4-a716-446655440000';

update public.terminals
set location_verified_at = null,
    location_source_url = null
where route_id = '550e8400-e29b-41d4-a716-446655440000';
