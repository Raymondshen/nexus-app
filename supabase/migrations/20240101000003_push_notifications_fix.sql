-- Push subscriptions are device-level, not crew-level — allow null crew_id
alter table push_subscriptions alter column crew_id drop not null;

-- One row per device/browser endpoint
create unique index if not exists push_subscriptions_endpoint_key
  on push_subscriptions (endpoint);

-- Track whether the 2-hour expiry warning has been sent for each raid
alter table active_raids
  add column if not exists expiry_notif_sent boolean not null default false;
