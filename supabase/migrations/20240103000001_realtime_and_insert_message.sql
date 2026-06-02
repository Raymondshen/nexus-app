-- ============================================================
-- 1. Enable Realtime publication for live chat + raid updates
-- ============================================================
-- Without these lines the postgres_changes subscriptions in MessageList
-- and BossCard never receive events, so messages only appear for the
-- sender (via optimistic local state) and never for other users.

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table active_raids;


-- ============================================================
-- 2. insert_message — insert a message as the calling user
-- ============================================================
-- Computes element_type server-side (matching the client's getElementType
-- logic) and returns the full row so the caller has the real UUID and
-- timestamps immediately for the optimistic UI update.

create or replace function insert_message(
  p_crew_id      uuid,
  p_content      text,
  p_message_type text default 'text'
)
returns messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_elem_type text;
  result      messages;
begin
  if not is_crew_member(p_crew_id) then
    raise exception 'not_a_member';
  end if;

  -- Mirror the element logic from src/lib/game/xp.ts getElementType()
  v_elem_type := case
    when p_message_type = 'reaction' then 'shadow'
    when p_message_type = 'voice'    then 'lightning'
    when p_message_type = 'image'    then 'nature'
    when length(p_content) < 20      then 'fire'
    when length(p_content) > 150     then 'water'
    else null
  end;

  insert into messages (crew_id, user_id, content, message_type, element_type, xp_awarded)
  values (p_crew_id, v_user_id, p_content, p_message_type, v_elem_type, 0)
  returning * into result;

  return result;
end;
$$;
