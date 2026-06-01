create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  crew_id    uuid not null references crews(id)    on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "users can select own subscriptions"
  on push_subscriptions for select
  using (auth.uid() = user_id);

create policy "users can insert own subscriptions"
  on push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "users can delete own subscriptions"
  on push_subscriptions for delete
  using (auth.uid() = user_id);
