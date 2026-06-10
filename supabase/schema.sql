-- ============================================================
-- EjeepHero Supabase Schema
-- AI-Assisted Real-Time E-Jeepney Tracking for Makati City
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: routes
-- ============================================================
CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  operating_hours TEXT DEFAULT '5:00 AM - 10:00 PM',
  color_code TEXT NOT NULL DEFAULT '#1F4E79',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: terminals
-- ============================================================
CREATE TABLE IF NOT EXISTS terminals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  sequence_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_terminals_route_id ON terminals(route_id);
CREATE INDEX idx_terminals_sequence ON terminals(route_id, sequence_order);

-- ============================================================
-- TABLE: vehicles
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL,
  route_id UUID REFERENCES routes(id),
  plate_number TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vehicles_driver ON vehicles(driver_id);
CREATE INDEX idx_vehicles_route ON vehicles(route_id);
CREATE INDEX idx_vehicles_active ON vehicles(is_active);

-- ============================================================
-- TABLE: vehicle_positions (Realtime enabled)
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicle_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION DEFAULT 0,
  heading DOUBLE PRECISION DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vpos_vehicle ON vehicle_positions(vehicle_id);
CREATE INDEX idx_vpos_timestamp ON vehicle_positions(timestamp DESC);

-- ============================================================
-- TABLE: trips
-- ============================================================
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  passenger_id UUID NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id),
  route_id UUID NOT NULL REFERENCES routes(id),
  boarding_terminal_id UUID REFERENCES terminals(id),
  alighting_terminal_id UUID REFERENCES terminals(id),
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  fare_amount NUMERIC(10,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled'))
);

CREATE INDEX idx_trips_passenger ON trips(passenger_id);
CREATE INDEX idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX idx_trips_status ON trips(status);

-- ============================================================
-- TABLE: ratings
-- ============================================================
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ratings_trip ON ratings(trip_id);
CREATE INDEX idx_ratings_driver ON ratings(driver_id);

-- ============================================================
-- TABLE: sos_events
-- ============================================================
CREATE TABLE IF NOT EXISTS sos_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_sos_user ON sos_events(user_id);
CREATE INDEX idx_sos_resolved ON sos_events(resolved);

-- ============================================================
-- TABLE: anomalies (Realtime enabled)
-- ============================================================
CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('speed_anomaly', 'route_deviation', 'crash_detected', 'prolonged_stop')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX idx_anomalies_vehicle ON anomalies(vehicle_id);
CREATE INDEX idx_anomalies_type ON anomalies(type);
CREATE INDEX idx_anomalies_resolved ON anomalies(resolved);

-- ============================================================
-- TABLE: announcements (Realtime enabled)
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'alert', 'weather', 'maintenance')),
  route_id UUID REFERENCES routes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_announcements_route ON announcements(route_id);
CREATE INDEX idx_announcements_type ON announcements(type);

-- ============================================================
-- TABLE: weather_cache
-- ============================================================
CREATE TABLE IF NOT EXISTS weather_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condition TEXT NOT NULL,
  description TEXT,
  temp DOUBLE PRECISION,
  feels_like DOUBLE PRECISION,
  humidity INTEGER,
  wind_speed DOUBLE PRECISION,
  icon TEXT,
  is_adverse BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ENABLE SUPABASE REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE anomalies;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;

-- Public read access for routes and terminals (everyone can see routes)
CREATE POLICY "Routes are viewable by everyone" ON routes FOR SELECT USING (true);
CREATE POLICY "Terminals are viewable by everyone" ON terminals FOR SELECT USING (true);

-- Vehicle positions: anyone can read (passengers need to see), drivers can insert
CREATE POLICY "Vehicle positions are viewable by everyone" ON vehicle_positions FOR SELECT USING (true);
CREATE POLICY "Drivers can insert vehicle positions" ON vehicle_positions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Vehicles: anyone can read active vehicles, drivers can manage their own
CREATE POLICY "Active vehicles are viewable by everyone" ON vehicles FOR SELECT USING (true);
CREATE POLICY "Drivers can insert their vehicles" ON vehicles FOR INSERT WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Drivers can update their vehicles" ON vehicles FOR UPDATE USING (auth.uid() = driver_id);

-- Trips: passengers can manage their own trips
CREATE POLICY "Users can view their trips" ON trips FOR SELECT USING (auth.uid() = passenger_id);
CREATE POLICY "Users can create trips" ON trips FOR INSERT WITH CHECK (auth.uid() = passenger_id);
CREATE POLICY "Users can update their trips" ON trips FOR UPDATE USING (auth.uid() = passenger_id);

-- Ratings: passengers can create, everyone can read
CREATE POLICY "Ratings are viewable by everyone" ON ratings FOR SELECT USING (true);
CREATE POLICY "Users can create ratings" ON ratings FOR INSERT WITH CHECK (auth.uid() = passenger_id);

-- SOS events: users can create their own, viewable by all authenticated users
CREATE POLICY "Users can create SOS events" ON sos_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can view SOS events" ON sos_events FOR SELECT USING (auth.uid() IS NOT NULL);

-- Anomalies: viewable by all authenticated users, system/drivers can insert
CREATE POLICY "Anomalies are viewable by authenticated users" ON anomalies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert anomalies" ON anomalies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Announcements: viewable by everyone
CREATE POLICY "Announcements are viewable by everyone" ON announcements FOR SELECT USING (true);

-- Weather cache: viewable by everyone, authenticated users can update
CREATE POLICY "Weather cache is viewable by everyone" ON weather_cache FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage weather cache" ON weather_cache FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update weather cache" ON weather_cache FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- SEED DATA: Routes
-- ============================================================
INSERT INTO routes (id, name, description, operating_hours, color_code) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'MRT Buendia ↔ Mandaluyong City Hall', 'Main e-Sakay route connecting MRT Buendia station through Makati CBD via Paseo de Roxas, Jupiter, and Makati Ave to Mandaluyong City Hall. Passes through key commercial districts.', '5:00 AM - 10:00 PM', '#1F4E79'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'One Ayala ↔ Circuit Makati', 'Modernized jeepney route from One Ayala Terminal through Gil Puyat Ave, Jupiter, Kalayaan to Circuit Makati entertainment complex. Serves southern Makati and Rockwell area.', '8:00 AM - 10:00 PM', '#00B050'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Makati CBD Loop (Legaspi-Salcedo)', 'Inner CBD circulator loop serving Legaspi Village and Salcedo Village business districts. Ideal for office workers and short CBD trips.', '7:00 AM - 7:00 PM', '#FFB300');

-- ============================================================
-- SEED DATA: Terminals for Route 1 (MRT Buendia ↔ Mandaluyong)
-- ============================================================
INSERT INTO terminals (route_id, name, latitude, longitude, sequence_order) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'MRT Buendia / Buendia-Kalayaan Flyover', 14.5525, 121.0338, 1),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Paseo de Roxas / Gil Puyat Intersection', 14.5594, 121.0289, 2),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Jupiter St / Makati Ave', 14.5611, 121.0297, 3),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Nicanor Garcia (Reposo)', 14.5630, 121.0310, 4),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Kalayaan Ave', 14.5640, 121.0280, 5),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Makati-Mandaluyong Bridge', 14.5700, 121.0330, 6),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Coronado St, Mandaluyong', 14.5750, 121.0340, 7),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Maysilo Circle / Mandaluyong City Hall', 14.5775, 121.0336, 8);

-- ============================================================
-- SEED DATA: Terminals for Route 2 (One Ayala ↔ Circuit Makati)
-- ============================================================
INSERT INTO terminals (route_id, name, latitude, longitude, sequence_order) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'One Ayala Terminal', 14.5505, 121.0279, 1),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Sen. Gil Puyat / Makati Ave', 14.5535, 121.0273, 2),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Jupiter Street', 14.5590, 121.0295, 3),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Nicanor Garcia', 14.5630, 121.0310, 4),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Kalayaan / South Ave', 14.5680, 121.0260, 5),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'J.P. Rizal Ave', 14.5720, 121.0220, 6),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Circuit Makati (Gallery Drive)', 14.5747, 121.0192, 7);

-- ============================================================
-- SEED DATA: Terminals for Route 3 (Makati CBD Loop)
-- ============================================================
INSERT INTO terminals (route_id, name, latitude, longitude, sequence_order) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Landmark Dept Store (Makati Ave)', 14.5500, 121.0174, 1),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Paseo de Roxas / Legaspi St', 14.5570, 121.0220, 2),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Legaspi Village', 14.5545, 121.0235, 3),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Dela Rosa St', 14.5530, 121.0215, 4),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Salcedo Village', 14.5565, 121.0195, 5),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'H.V. Dela Costa', 14.5548, 121.0180, 6),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'V.A. Rufino St', 14.5520, 121.0165, 7);
