-- Add first_name and last_name to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name  text;

-- Add first_name and last_name to reserved_users so they are captured at waitlist time
ALTER TABLE reserved_users ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE reserved_users ADD COLUMN IF NOT EXISTS last_name  text;
