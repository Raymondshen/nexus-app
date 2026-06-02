-- leave_crew: removes the calling user from a crew.
-- Runs as SECURITY DEFINER so it can bypass RLS for counting, redistribution,
-- and deletion without exposing the service role key to Next.js.
create or replace function leave_crew(p_crew_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_member_count int;
  v_remaining    uuid[];
  v_artifact_id  uuid;
  v_idx          int := 0;
begin
  -- Verify the caller is actually a member
  if not exists (
    select 1 from crew_members
    where crew_id = p_crew_id and user_id = v_user_id
  ) then
    raise exception 'not_a_member';
  end if;

  select count(*) into v_member_count
  from crew_members
  where crew_id = p_crew_id;

  -- Last member: delete the entire crew (CASCADE handles everything)
  if v_member_count <= 1 then
    delete from crews where id = p_crew_id;
    return jsonb_build_object('deleted', true);
  end if;

  -- Collect remaining member IDs for artifact redistribution
  select array_agg(user_id) into v_remaining
  from crew_members
  where crew_id = p_crew_id and user_id != v_user_id;

  -- Redistribute leaving user's MVP artifacts round-robin
  for v_artifact_id in (
    select id from artifacts
    where crew_id = p_crew_id and mvp_user_id = v_user_id
    order by earned_at
  ) loop
    update artifacts
      set mvp_user_id = v_remaining[(v_idx % array_length(v_remaining, 1)) + 1]
      where id = v_artifact_id;
    v_idx := v_idx + 1;
  end loop;

  -- Remove from crew
  delete from crew_members
  where crew_id = p_crew_id and user_id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$$;
