-- Add birthday column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday date;
