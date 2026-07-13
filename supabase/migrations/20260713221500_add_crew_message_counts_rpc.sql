-- get_crew_message_counts: batched per-crew total message count, same pattern as
-- get_unread_counts. Used by the home page's squad list preview card, which was
-- previously (and incorrectly) displaying crews.total_xp mislabeled as "Total MSG."
-- Returns only crews with at least 1 message (missing = 0 on the client).
CREATE OR REPLACE FUNCTION get_crew_message_counts(p_crew_ids uuid[])
RETURNS TABLE (crew_id uuid, msg_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.crew_id, COUNT(*)::bigint AS msg_count
  FROM messages m
  WHERE m.crew_id       = ANY(p_crew_ids)
    AND m.message_type <> 'system'
  GROUP BY m.crew_id
$$;
