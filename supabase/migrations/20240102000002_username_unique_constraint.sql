-- Case-insensitive unique index on profiles.username.
-- Prevents "ShadowBlade" and "shadowblade" from coexisting.
-- This is the hard constraint; client-side pre-checks are UX only.
create unique index if not exists profiles_username_ci
  on profiles (lower(username));
