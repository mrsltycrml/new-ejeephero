-- Update routes and terminals for MRT BUENDIA - MANDALUYONG CITY HALL route
-- Date: 2026-09-14

-- Delete existing routes and terminals
DELETE FROM terminals WHERE route_id IN (SELECT id FROM routes);
DELETE FROM routes;

-- Create the single route with a UUID
INSERT INTO routes (id, name, description, color_code, operating_hours, base_fare, per_km_rate, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'MRT BUENDIA - MANDALUYONG CITY HALL',
  'Non-Aircon Modern and Electric PJU Route connecting MRT Buendia to Mandaluyong City Hall',
  '#C41E3A',
  '06:00-22:00',
  14.00,
  1.50,
  NOW()
);

-- Insert the 6 landmark stops
-- Stop 1: MRT BUENDIA/ZODIAC (Starting point)
INSERT INTO terminals (id, route_id, name, latitude, longitude, sequence_order, regular_fare, student_fare, elderly_fare, disabled_fare, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'MRT BUENDIA/ZODIAC',
  14.5547,
  121.0244,
  0,
  0.00,
  0.00,
  0.00,
  0.00,
  NOW()
);

-- Stop 2: JUPITER ST., COR. MAKATI AVENUE
INSERT INTO terminals (id, route_id, name, latitude, longitude, sequence_order, regular_fare, student_fare, elderly_fare, disabled_fare, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440002'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'JUPITER ST., COR. MAKATI AVENUE',
  14.5565,
  121.0310,
  1,
  14.00,
  11.25,
  11.25,
  11.25,
  NOW()
);

-- Stop 3: LOPEZ DRIVE/ESTRELLA PANTALEON BRIDGE
INSERT INTO terminals (id, route_id, name, latitude, longitude, sequence_order, regular_fare, student_fare, elderly_fare, disabled_fare, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440003'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'LOPEZ DRIVE/ESTRELLA PANTALEON BRIDGE',
  14.5599,
  121.0380,
  2,
  14.00,
  11.25,
  11.25,
  11.25,
  NOW()
);

-- Stop 4: CITY MANDALUYONG SCIENCE HIGH SCHOOL
INSERT INTO terminals (id, route_id, name, latitude, longitude, sequence_order, regular_fare, student_fare, elderly_fare, disabled_fare, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440004'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'CITY MANDALUYONG SCIENCE HIGH SCHOOL',
  14.5650,
  121.0450,
  3,
  14.00,
  11.25,
  11.25,
  11.25,
  NOW()
);

-- Stop 5: TIVOLI GARDEN
INSERT INTO terminals (id, route_id, name, latitude, longitude, sequence_order, regular_fare, student_fare, elderly_fare, disabled_fare, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440005'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'TIVOLI GARDEN',
  14.5700,
  121.0520,
  4,
  14.00,
  11.25,
  11.25,
  11.25,
  NOW()
);

-- Stop 6: MAYSILO CIRCLE/MANDALUYONG CITY (End point)
INSERT INTO terminals (id, route_id, name, latitude, longitude, sequence_order, regular_fare, student_fare, elderly_fare, disabled_fare, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440006'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'MAYSILO CIRCLE/MANDALUYONG CITY',
  14.5750,
  121.0590,
  5,
  15.75,
  12.75,
  12.75,
  12.75,
  NOW()
);
