-- ============================================================
-- Add last_seen to crew_members for online presence
-- ============================================================

alter table crew_members
  add column if not exists last_seen timestamptz;

-- Allow users to update their own crew_member rows (needed for last_seen)
create policy "crew_members: users can update own row"
  on crew_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- Atomic boss damage to prevent HP corruption from concurrent attacks
-- ============================================================

create or replace function damage_raid(
  p_raid_id uuid,
  p_damage  integer,
  p_user_id uuid
)
returns table(current_hp integer, phase integer, defeated_at timestamptz)
language plpgsql
security definer
as $$
declare
  v_max_hp     integer;
  v_new_hp     integer;
  v_new_phase  integer;
  v_defeated   timestamptz;
  v_hp_pct     float;
begin
  -- Read max_hp first (immutable after creation)
  select ar.max_hp into v_max_hp
  from active_raids ar
  where ar.id = p_raid_id;

  -- Atomically decrement HP
  -- Qualify active_raids.defeated_at to avoid ambiguity with the RETURNS TABLE output column
  update active_raids
  set current_hp = greatest(0, active_raids.current_hp - p_damage)
  where id = p_raid_id
    and active_raids.defeated_at is null
  returning active_raids.current_hp into v_new_hp;

  if v_new_hp is null then
    -- Raid already defeated or not found
    select ar.current_hp, ar.phase, ar.defeated_at
      into v_new_hp, v_new_phase, v_defeated
    from active_raids ar where ar.id = p_raid_id;
    return query select v_new_hp, v_new_phase, v_defeated;
    return;
  end if;

  -- Compute new phase
  v_hp_pct := v_new_hp::float / v_max_hp::float;
  if v_hp_pct <= 0.30 then
    v_new_phase := 3;
  elsif v_hp_pct <= 0.60 then
    v_new_phase := 2;
  else
    v_new_phase := 1;
  end if;

  v_defeated := null;

  if v_new_hp = 0 then
    v_defeated := now();
    update active_raids
    set phase = v_new_phase,
        defeated_at = v_defeated,
        mvp_user_id = p_user_id
    where id = p_raid_id;
  else
    update active_raids
    set phase = v_new_phase
    where id = p_raid_id;
  end if;

  return query select v_new_hp, v_new_phase, v_defeated;
end;
$$;

-- ============================================================
-- Atomic XP increment to prevent race conditions
-- ============================================================

create or replace function increment_crew_xp(
  p_crew_id  uuid,
  p_xp_delta integer
)
returns table(new_total_xp integer, new_level integer)
language plpgsql
security definer
as $$
declare
  v_xp   integer;
  v_lvl  integer;
begin
  update crews
  set
    total_xp = total_xp + p_xp_delta,
    level    = floor((total_xp + p_xp_delta) / 500) + 1
  where id = p_crew_id
  returning total_xp, level into v_xp, v_lvl;

  return query select v_xp, v_lvl;
end;
$$;
