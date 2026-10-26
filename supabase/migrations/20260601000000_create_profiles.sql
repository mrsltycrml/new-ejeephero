-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT CHECK (role IN ('passenger', 'driver')) DEFAULT 'passenger',
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  is_admin BOOLEAN DEFAULT FALSE,
  full_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Users can update their own full_name only
CREATE POLICY "Users can update own name" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    role = (SELECT role FROM profiles WHERE id = auth.uid()) AND
    status = (SELECT status FROM profiles WHERE id = auth.uid()) AND
    is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

-- Admins can update any profile (approve/reject, change role)
CREATE POLICY "Admins can update all profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Auto-create profile on signup via trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, role, status, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'passenger'),
    'pending',
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill existing users into profiles
INSERT INTO profiles (id, email, role, status, full_name)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'role', 'passenger'),
  'approved',
  COALESCE(raw_user_meta_data->>'full_name', '')
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

-- Set admin account
UPDATE profiles SET is_admin = true, status = 'approved' WHERE email = 'admin@ejeephero';
