create table if not exists notification_preferences (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  notif_messages boolean not null default true,
  notif_raids    boolean not null default true,
  notif_victory  boolean not null default true,
  updated_at     timestamptz not null default now()
);

alter table notification_preferences enable row level security;

create policy "Users manage own notification preferences"
  on notification_preferences
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
