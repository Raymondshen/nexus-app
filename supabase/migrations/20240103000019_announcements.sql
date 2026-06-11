-- Announcement banners shown on the home screen, managed by dev users.
create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  text       text not null check (char_length(text) between 1 and 500),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table announcements enable row level security;

-- Anyone (including guests) can read active announcements
create policy "announcements: public read active"
  on announcements for select using (active = true);
