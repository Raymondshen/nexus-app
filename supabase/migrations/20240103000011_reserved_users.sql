-- Waitlist for invite-only gate. No auth session created — purely a reservation.
create table reserved_users (
  id         uuid        primary key default gen_random_uuid(),
  email      text        unique not null,
  username   text        not null,
  class      text,
  created_at timestamptz not null default now(),
  converted  boolean     not null default false
);

alter table reserved_users enable row level security;

-- Anyone (anon or authenticated) can submit a reservation — this is a public waitlist.
create policy "reserved_users: anyone can insert"
  on reserved_users for insert
  with check (true);

-- No select or update policies — only service role can read or update rows.
