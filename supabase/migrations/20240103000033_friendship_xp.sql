-- ─── friendship_xp_enabled per-user beta flag ──────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS friendship_xp_enabled boolean NOT NULL DEFAULT false;

-- ─── friendship_xp — bilateral shared XP for a user pair ───────────────────
-- user_a is always the lesser UUID (canonical ordering enforced by check).
CREATE TABLE IF NOT EXISTS friendship_xp (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_b      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_xp    integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendship_xp_pair_unique   UNIQUE (user_a, user_b),
  CONSTRAINT friendship_xp_canonical_order CHECK (user_a < user_b)
);

ALTER TABLE friendship_xp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendship_xp: users see own pair"
  ON friendship_xp FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- No client-side INSERT/UPDATE — all writes go through the Edge Function
-- with the service role key.

-- ─── friendship_xp_log — audit trail ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friendship_xp_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a      uuid        NOT NULL,
  user_b      uuid        NOT NULL,
  xp_awarded  integer     NOT NULL,
  source      text        NOT NULL CHECK (source IN ('dm', 'mention')),
  awarded_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE friendship_xp_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendship_xp_log: users see own pair"
  ON friendship_xp_log FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- ─── Atomic increment RPC (called by the Edge Function) ─────────────────────
CREATE OR REPLACE FUNCTION increment_friendship_xp(
  p_user_a uuid,
  p_user_b uuid,
  p_amount  integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_xp integer;
BEGIN
  INSERT INTO friendship_xp (user_a, user_b, total_xp, updated_at)
  VALUES (p_user_a, p_user_b, p_amount, now())
  ON CONFLICT (user_a, user_b)
  DO UPDATE SET
    total_xp   = friendship_xp.total_xp + p_amount,
    updated_at = now()
  RETURNING total_xp INTO v_new_xp;
  RETURN v_new_xp;
END; $$;

-- ─── Realtime — friendship_xp updates live in the FriendshipXPBar ───────────
ALTER PUBLICATION supabase_realtime ADD TABLE friendship_xp;
