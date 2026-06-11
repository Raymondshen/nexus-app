-- Add status field to profiles (mood/note, max 100 chars)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE profiles ADD CONSTRAINT profiles_status_length CHECK (length(status) <= 100);
