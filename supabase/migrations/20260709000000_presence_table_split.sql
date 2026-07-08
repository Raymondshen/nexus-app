-- ============================================================
-- Decouple presence from profiles: dedicated user_presence table
-- ============================================================
-- update_active() previously wrote profiles.last_active_at every ~30s per
-- open chat tab (plus a throttled write on every message send). profiles is
-- also the most frequently read/joined table in the app (auth, avatars,
-- member lists everywhere), so that heartbeat was creating a steady stream
-- of dead tuples on a hot table it has no other relationship to. Presence
-- now lives in its own narrow table so those writes/dead-tuple churn stay
-- isolated from profiles.

CREATE TABLE user_presence (
  user_id        uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  last_active_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Mirrors "profiles: anyone can read" — any authenticated user needs to see
-- crewmates' presence to render online dots. No insert/update/delete policy:
-- all writes go through the SECURITY DEFINER update_active() RPC below.
CREATE POLICY "user_presence: anyone can read"
  ON user_presence FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION update_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO user_presence (user_id, last_active_at)
  VALUES (auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET last_active_at = now();
END;
$$;

ALTER TABLE profiles DROP COLUMN IF EXISTS last_active_at;
