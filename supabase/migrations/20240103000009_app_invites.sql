-- App-level invite codes. One code per inviter (unused). Inviter spends 25 coins to generate.
create table app_invites (
  id         uuid        primary key default gen_random_uuid(),
  code       text        unique not null,
  inviter_id uuid        references profiles(id) on delete set null,
  used       boolean     not null default false,
  used_by    uuid        references profiles(id) on delete set null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

alter table app_invites enable row level security;

-- Inviter can read their own codes
create policy "app_invites: inviter reads own"
  on app_invites for select using (auth.uid() = inviter_id);

-- Inviter can insert their own codes
create policy "app_invites: inviter inserts"
  on app_invites for insert with check (auth.uid() = inviter_id);
