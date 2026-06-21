-- ============================================================
-- Global presence: last_active_at on profiles
-- Online is derived at read time (last_active_at > now() - 45s)
-- No is_online boolean — never store online/offline as a flag
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- Lightweight SECURITY DEFINER RPC — single-row UPDATE, no joins, no triggers
-- Client calls this instead of a direct update so no extra RLS policy is needed
CREATE OR REPLACE FUNCTION update_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET last_active_at = now()
  WHERE id = auth.uid();
END;
$$;
