-- Extracts the "pick a replacement pin among this user's remaining squads" logic
-- leave_crew grew in 20260720130000_pin_squad_invariant.sql into its own helper,
-- `repick_pinned_crew`, so the same rule can also run from `kickMemberAction`
-- (chat/actions.ts) — a kicked member's crew_members row is deleted directly via
-- the service client, never through the leave_crew RPC, so that path needed the
-- exact same invariant-preserving logic or a kicked user's stale pin would sit
-- pointing at a crew they're no longer in.
create or replace function public.repick_pinned_crew(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_crew_count int;
  v_new_pin    uuid;
begin
  select count(*) into v_crew_count
  from crew_members cm
  join crews c on c.id = cm.crew_id
  where cm.user_id = p_user_id and c.is_dm = false;

  if v_crew_count = 0 then
    v_new_pin := null;
  else
    select cm.crew_id into v_new_pin
    from crew_members cm
    join crews c on c.id = cm.crew_id
    left join (
      select crew_id, count(*) as msg_count
      from messages
      where user_id = p_user_id
      group by crew_id
    ) m on m.crew_id = cm.crew_id
    where cm.user_id = p_user_id and c.is_dm = false
    order by coalesce(m.msg_count, 0) desc, cm.joined_at asc, cm.crew_id asc
    limit 1;
  end if;

  update profiles set pinned_crew_id = v_new_pin where id = p_user_id;
end;
$function$;

-- Only ever needs to be called server-side: leave_crew calls it internally (runs
-- as the SECURITY DEFINER owner regardless of grants), and kickMemberAction calls
-- it via the service-role client. No client should ever call this directly — it
-- takes an arbitrary p_user_id with no ownership check, unlike every other
-- client-facing RPC.
revoke execute on function public.repick_pinned_crew(uuid) from public, anon, authenticated;
grant execute on function public.repick_pinned_crew(uuid) to service_role;

-- leave_crew: replace its inline re-pick block with a call to the new helper.
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
begin
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

  if v_member_count <= 1 then
    delete from crews where id = p_crew_id;
    v_deleted := true;
  else
    delete from crew_members
    where crew_id = p_crew_id and user_id = v_user_id;
  end if;

  if v_was_pinned then
    perform repick_pinned_crew(v_user_id);
  end if;

  if v_deleted then
    return jsonb_build_object('deleted', true);
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;
