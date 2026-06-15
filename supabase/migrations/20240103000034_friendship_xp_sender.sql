-- Track who triggered each XP event (user_a/user_b are canonical order, not sender order)
ALTER TABLE friendship_xp_log
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES profiles(id);

-- Index for the daily-limit query: WHERE sender_id = ? AND awarded_at >= ?
CREATE INDEX IF NOT EXISTS friendship_xp_log_sender_day
  ON friendship_xp_log (sender_id, awarded_at DESC);
