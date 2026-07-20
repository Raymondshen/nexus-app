-- Pin Squad invariant: "there is always exactly one pinned squad" for any user who
-- belongs to at least one squad (never DMs). Three parts:
--
-- 1. One-time backfill for every existing account with no pin yet: 1 squad -> pin it
--    directly; 2+ squads -> pin whichever the user has sent the most messages in
--    (ties broken by earliest joined_at, then crew id, for determinism). Accounts
--    with zero squads are left null (they land on Home, same as always).
-- 2. create_crew / join_crew: auto-pin the crew being created/joined whenever the
--    caller doesn't already have a pin — covers a brand-new user's first squad
--    without overriding a pin they've already chosen.
-- 3. leave_crew: if the crew being left was the caller's pinned squad, re-pin one of
--    their remaining squads using the same 1-squad/most-messages rule as the backfill
--    (or null if none remain). The FK's `ON DELETE SET NULL` only clears a dangling
--    pin when the crew itself is hard-deleted — it never picks a replacement, so this
--    has to run explicitly inside the function for both the "crew deleted" (last
--    member) and "crew still exists, caller just left" paths.
--
-- leave_crew is also rewritten here to drop a dead "redistribute MVP artifacts"
-- block that referenced the `artifacts` table — that table was dropped by
-- 20260712000000_remove_combat_system.sql without updating this function (edited
-- live via the Supabase MCP apply_migration tool in an earlier session, so it never
-- got a corresponding local migration — see the project's migration-drift note).
-- Since then, leave_crew has been throwing "relation artifacts does not exist" for
-- every leave EXCEPT the last-member-deletes-the-crew path, which skipped the block
-- entirely. Confirmed live via pg_proc/information_schema before writing this.

-- ─── 1. Backfill existing accounts ─────────────────────────────────────────────
with ranked as (
  select
    cm.user_id,
    cm.crew_id,
    row_number() over (
      partition by cm.user_id
      order by coalesce(m.msg_count, 0) desc, cm.joined_at asc, cm.crew_id asc
    ) as rn
  from crew_members cm
  join crews c on c.id = cm.crew_id
  left join (
    select crew_id, user_id, count(*) as msg_count
    from messages
    group by crew_id, user_id
  ) m on m.crew_id = cm.crew_id and m.user_id = cm.user_id
  where c.is_dm = false
)
update profiles p
set pinned_crew_id = r.crew_id
from ranked r
where r.user_id = p.id
  and r.rn = 1
  and p.pinned_crew_id is null;

-- ─── 2. Auto-pin on create/join when the caller has no pin yet ────────────────
create or replace function public.create_crew(p_name text, p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    v_crew_id uuid;
  begin
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;
    insert into crews (name, invite_code)
      values (p_name, p_invite_code)
      returning id into v_crew_id;
    insert into crew_members (crew_id, user_id)
      values (v_crew_id, auth.uid());
    update profiles set pinned_crew_id = v_crew_id
      where id = auth.uid() and pinned_crew_id is null;
    return v_crew_id;
  end;
  $function$;

create or replace function public.join_crew(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    v_crew_id uuid;
  begin
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;
    select id into v_crew_id from crews where invite_code = p_invite_code;
    if v_crew_id is null then
      raise exception 'Crew not found';
    end if;
    insert into crew_members (crew_id, user_id)
      values (v_crew_id, auth.uid())
      on conflict (crew_id, user_id) do nothing;
    update profiles set pinned_crew_id = v_crew_id
      where id = auth.uid() and pinned_crew_id is null;
    return v_crew_id;
  end;
  $function$;

-- ─── 3. Re-pin on leave when the left crew was the pin ────────────────────────
create or replace function public.leave_crew(p_crew_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id      uuid := auth.uid();
  v_member_count int;
  v_was_pinned   boolean;
  v_deleted      boolean := false;
  v_new_pin      uuid;
  v_crew_count   int;
begin
  -- Verify the caller is actually a member
  if not exists (
    select 1 from crew_members
    where crew_id = p_crew_id and user_id = v_user_id
  ) then
    raise exception 'not_a_member';
  end if;

  select (pinned_crew_id = p_crew_id) into v_was_pinned
  from profiles where id = v_user_id;

  select count(*) into v_member_count
  from crew_members
  where crew_id = p_crew_id;

  -- Last member: delete the entire crew (CASCADE handles everything)
  if v_member_count <= 1 then
    delete from crews where id = p_crew_id;
    v_deleted := true;
  else
    delete from crew_members
    where crew_id = p_crew_id and user_id = v_user_id;
  end if;

  -- Pin Squad invariant: the FK's ON DELETE SET NULL only clears a pin when the
  -- crew itself is hard-deleted (the v_deleted branch above) — it never picks a
  -- replacement, and doesn't fire at all for the "crew still exists, caller just
  -- left" branch. Re-pick explicitly here so both paths land on the same rule the
  -- backfill migration used: 1 remaining squad -> pin it; 2+ -> pin whichever has
  -- the most messages sent by this user; 0 -> null (Home).
  if v_was_pinned then
    select count(*) into v_crew_count
    from crew_members cm
    join crews c on c.id = cm.crew_id
    where cm.user_id = v_user_id and c.is_dm = false;

    if v_crew_count = 0 then
      v_new_pin := null;
    else
      select cm.crew_id into v_new_pin
      from crew_members cm
      join crews c on c.id = cm.crew_id
      left join (
        select crew_id, count(*) as msg_count
        from messages
        where user_id = v_user_id
        group by crew_id
      ) m on m.crew_id = cm.crew_id
      where cm.user_id = v_user_id and c.is_dm = false
      order by coalesce(m.msg_count, 0) desc, cm.joined_at asc, cm.crew_id asc
      limit 1;
    end if;

    update profiles set pinned_crew_id = v_new_pin where id = v_user_id;
  end if;

  if v_deleted then
    return jsonb_build_object('deleted', true);
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;
