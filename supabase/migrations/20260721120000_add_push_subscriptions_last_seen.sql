-- Tracks the last time the service worker's push handler confirmed a
-- subscription is still alive (see sw-push.js's push handler + the
-- /api/push/heartbeat route). Web Push has no delivery receipt — a push
-- service accepting a send only means it queued the message, not that the
-- device displayed it — so this is the only signal we have that a
-- subscription's browser-side registration is still genuinely live. Updated
-- opportunistically on every push the SW actually processes, even while the
-- app itself is closed, rather than only when the app is opened.
alter table push_subscriptions
  add column if not exists last_seen_at timestamptz;
