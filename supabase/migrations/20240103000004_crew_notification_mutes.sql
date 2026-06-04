-- per-crew notification mutes
-- A row means the user has muted message notifications for that specific crew.
-- Raid / victory notifications are not affected (those use global notification_preferences).

create table if not exists crew_notification_mutes (
  user_id uuid not null references auth.users(id) on delete cascade,
  crew_id uuid not null references public.crews(id) on delete cascade,
  primary key (user_id, crew_id)
);

alter table crew_notification_mutes enable row level security;

create policy "Users manage own crew notification mutes"
  on crew_notification_mutes for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
