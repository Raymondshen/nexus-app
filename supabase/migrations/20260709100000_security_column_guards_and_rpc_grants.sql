-- Security hardening (audit HIGH #1, #2, #4 + MEDIUM policy fixes).
-- Applied live via MCP on 2026-07-09; committed here so the repo migration
-- history matches the database.

-- ── HIGH #1: profiles — block client writes to is_dev / coins; enforce username ──
create or replace function public.prevent_client_privileged_profile_writes()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if new.is_dev is distinct from old.is_dev
       or new.coins is distinct from old.coins then
      raise exception 'is_dev and coins can only be modified by the server';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_columns on public.profiles;
create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row execute function public.prevent_client_privileged_profile_writes();

create or replace function public.enforce_username_format()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.role() in ('authenticated', 'anon')
     and new.username is distinct from old.username
     and new.username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'username must be 3-20 chars: letters, digits, underscore';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_username_format on public.profiles;
create trigger profiles_enforce_username_format
  before update on public.profiles
  for each row execute function public.enforce_username_format();

-- ── HIGH #2: crews — block client writes to XP / level / invite / DM fields ──
create or replace function public.prevent_client_crew_stat_writes()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if new.total_xp     is distinct from old.total_xp
       or new.level        is distinct from old.level
       or new.invite_code  is distinct from old.invite_code
       or new.is_dm        is distinct from old.is_dm
       or new.dm_partner_1 is distinct from old.dm_partner_1
       or new.dm_partner_2 is distinct from old.dm_partner_2 then
      raise exception 'crew XP, level, invite code and DM fields can only be modified by the server';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crews_protect_privileged_columns on public.crews;
create trigger crews_protect_privileged_columns
  before update on public.crews
  for each row execute function public.prevent_client_crew_stat_writes();

-- ── MEDIUM: messages — lock game/identity columns; content + image stay client-editable ──
create or replace function public.prevent_client_message_field_writes()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if new.reactions    is distinct from old.reactions
       or new.xp_awarded   is distinct from old.xp_awarded
       or new.element_type is distinct from old.element_type
       or new.message_type is distinct from old.message_type
       or new.user_id      is distinct from old.user_id
       or new.crew_id      is distinct from old.crew_id
       or new.created_at   is distinct from old.created_at then
      raise exception 'only message content and image fields are client-editable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_protect_privileged_columns on public.messages;
create trigger messages_protect_privileged_columns
  before update on public.messages
  for each row execute function public.prevent_client_message_field_writes();

-- ── MEDIUM: drop always-true INSERT policies (both tables are service-role-only) ──
drop policy if exists "coin_log: service role insert" on public.coin_log;
drop policy if exists "reserved_users: anyone can insert" on public.reserved_users;

-- ── HIGH #4: revoke client EXECUTE on internal SECURITY DEFINER functions ──
-- Revoke from PUBLIC (the default grant) as well as the two roles, since the
-- PUBLIC grant is inherited and revoking only anon/authenticated leaves it.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.increment_user_coins(uuid, integer)',
    'public.increment_crew_xp(uuid, integer)',
    'public.increment_friendship_xp(uuid, uuid, integer)',
    'public.damage_raid(uuid, integer, uuid)',
    'public.apply_boss_damage(uuid, uuid, integer)',
    'public.claim_daily_gem(uuid, timestamptz)',
    'public.init_combat_members(uuid, uuid, integer)',
    'public.toggle_reaction(uuid, text, uuid)',
    'public.handle_new_user()',
    'public.handle_updated_at()',
    'public.update_crew_last_message()',
    'public.messages_protect_pin_columns()',
    'public.prevent_client_gem_writes()',
    'public.prevent_client_crew_stat_writes()',
    'public.prevent_client_privileged_profile_writes()',
    'public.enforce_username_format()',
    'public.rls_auto_enable()',
    'public.auto_join_active_raid()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
end $$;

-- service_role must retain EXECUTE on the writers it invokes
grant execute on function public.increment_user_coins(uuid, integer)          to service_role;
grant execute on function public.increment_crew_xp(uuid, integer)             to service_role;
grant execute on function public.increment_friendship_xp(uuid, uuid, integer) to service_role;
grant execute on function public.damage_raid(uuid, integer, uuid)             to service_role;
grant execute on function public.apply_boss_damage(uuid, uuid, integer)       to service_role;
grant execute on function public.claim_daily_gem(uuid, timestamptz)           to service_role;
grant execute on function public.init_combat_members(uuid, uuid, integer)     to service_role;
grant execute on function public.toggle_reaction(uuid, text, uuid)            to service_role;
