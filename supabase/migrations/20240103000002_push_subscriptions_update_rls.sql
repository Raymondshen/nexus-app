-- Allow users to update their own push subscription rows.
-- Required for upsert (INSERT ... ON CONFLICT DO UPDATE) to succeed when the
-- endpoint already exists — without this policy the UPDATE path is blocked by
-- RLS and subscribeToPush() silently fails on every PushRefresh re-run.
create policy "users can update own subscriptions"
  on push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
