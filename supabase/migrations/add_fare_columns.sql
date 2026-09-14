-- Create extended fare tracking for different passenger types
-- Date: 2026-09-14

-- Add fare columns to terminals table if they don't exist
ALTER TABLE terminals
ADD COLUMN IF NOT EXISTS regular_fare REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS student_fare REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS elderly_fare REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS disabled_fare REAL DEFAULT 0;

-- Create a fares history table for tracking fare changes
CREATE TABLE IF NOT EXISTS fare_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  regular_fare REAL,
  student_fare REAL,
  elderly_fare REAL,
  disabled_fare REAL,
  effective_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on fare_history
ALTER TABLE fare_history ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access to fare history
CREATE POLICY "Allow public read access to fare_history"
  ON fare_history
  FOR SELECT
  USING (true);
