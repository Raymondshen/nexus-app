-- Persists two client-observed facts at subscribe/heartbeat time so the admin
-- push-diagnostics page (/profile/developer/push-diagnostics) can show real
-- OS-permission and service-worker state per user instead of guessing from
-- subscription presence alone. Both nullable: rows written before this
-- migration, and any row whose device hasn't re-subscribed or sent a
-- heartbeat since, simply show as unknown rather than a false positive/negative.
alter table push_subscriptions
  add column if not exists os_permission text,
  add column if not exists sw_state      text;
