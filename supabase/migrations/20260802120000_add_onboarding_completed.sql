-- New Google accounts get an auto-generated placeholder username from
-- handle_new_user (email local-part) the instant auth.users gets a row — so
-- checking "does profiles.username exist" could never tell a brand-new
-- signup apart from a returning user, and every new signup was routed
-- straight to /home (birthday backfill -> ChatroomEmptyScreen) instead of
-- the Setup Profile screen (Figma 774:20648). This flag is the real signal:
-- set only by completeSignupAction, once Setup Profile actually finishes.
alter table profiles
  add column if not exists onboarding_completed boolean not null default false;

-- Backfill: any row that already shows real signup progress (a birthday, a
-- chosen class, or an actual crew membership) is an existing account, not a
-- still-mid-signup one — mark it complete so it isn't sent back through
-- Setup Profile. Everything else (a bare trigger-created row with nothing
-- else set) is left false on purpose, including any account that got stuck
-- on the empty-home screen by this exact bug before the fix shipped.
update profiles p
set onboarding_completed = true
where p.birthday is not null
   or p.avatar_class is not null
   or exists (select 1 from crew_members cm where cm.user_id = p.id);

-- Server-only, same guard family as is_dev/coins — a direct PostgREST PATCH
-- must not be able to flip this and skip the required username/birthday/
-- class fields Setup Profile enforces.
create or replace function public.prevent_client_privileged_profile_writes()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if new.is_dev is distinct from old.is_dev
       or new.coins is distinct from old.coins
       or new.onboarding_completed is distinct from old.onboarding_completed then
      raise exception 'is_dev, coins, and onboarding_completed can only be modified by the server';
    end if;
  end if;
  return new;
end;
$$;
