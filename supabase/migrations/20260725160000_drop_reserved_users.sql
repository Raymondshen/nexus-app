-- The pre-auth "reserve your place" waitlist funnel (reserve-email ->
-- reserve-class -> reserve-name -> reserve-done in LoginForm.tsx, backed by
-- reservePlaceAction) has been removed from the app entirely. It predated
-- public signup (see the app_invites removal, migration
-- 20260725150000_drop_app_invites.sql) and had no reachable entry point
-- even before that. This table has no remaining readers or writers.
drop table if exists public.reserved_users;
