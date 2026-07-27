-- A per-device identifier, generated and persisted client-side (localStorage,
-- notifications.ts), stamped on every row that device ever writes. This is
-- the missing piece the notification-engine skill's own gotcha called for:
-- "Do not mass-delete old push_subscriptions rows... no device identifier,
-- so there's no safe way to tell 'stale row from this same device' apart
-- from 'a different device's still-valid subscription'... anything broader
-- needs a schema change (e.g. a device/session identifier) first."
--
-- With this in place, subscribeToPush() can safely prune a device's OWN
-- older rows (same user_id + device_id, different endpoint) every time it
-- successfully saves a subscription — self-healing the iOS
-- getSubscription()-false-negative duplicate-endpoint bug going forward,
-- without risking another device's still-valid row. Nullable: rows written
-- before this migration, or via a path that has no window/localStorage
-- access (the SW's own /api/push/resubscribe on APNs token rotation), stay
-- NULL and are simply never targeted by the pruning query.
alter table push_subscriptions
  add column if not exists device_id text;

create index if not exists push_subscriptions_user_device_idx
  on push_subscriptions (user_id, device_id);
