-- pending_deletions: stores accounts queued for permanent removal after a 7-day grace period.
-- The actual data wipeout is performed by the process-deletions edge function,
-- triggered daily via a Vercel cron job hitting /api/cron/process-deletions.

CREATE TABLE IF NOT EXISTS pending_deletions (
  user_id      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  delete_at    timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

ALTER TABLE pending_deletions ENABLE ROW LEVEL SECURITY;

-- Users can see their own pending deletion (to show the cancellation banner)
CREATE POLICY "own_pending_deletion_select" ON pending_deletions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can request deletion of their own account
CREATE POLICY "own_pending_deletion_insert" ON pending_deletions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can cancel their own pending deletion
CREATE POLICY "own_pending_deletion_delete" ON pending_deletions
  FOR DELETE USING (auth.uid() = user_id);
