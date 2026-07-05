-- One-time gate for legacy usernames containing characters no longer allowed
-- (spaces, apostrophes, periods, or other non [A-Za-z0-9_] characters).
-- Client shows a mandatory bottom sheet (UsernameResetSheet) until this clears.
alter table profiles
  add column if not exists needs_username_reset boolean not null default false;

update profiles
  set needs_username_reset = true
  where username !~ '^[A-Za-z0-9_]+$';
