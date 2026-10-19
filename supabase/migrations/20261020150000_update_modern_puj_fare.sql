-- Update the built-in Makati modern/electric PUJ route to the current
-- Metro Manila LTFRB guide. Preserve any fare values an operator has changed.
update public.routes
set base_fare = 17.00,
    per_km_rate = 2.40
where id = '550e8400-e29b-41d4-a716-446655440000'
  and base_fare = 14.00
  and per_km_rate = 1.50;
