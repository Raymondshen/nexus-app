-- get_unread_counts: replaces N parallel count queries on the home page with one RPC.
-- Returns only crews that have at least 1 unread message (missing = 0 on the client).
-- Uses auth.uid() internally so the caller cannot spoof a different user_id.
CREATE OR REPLACE FUNCTION get_unread_counts(
  p_crew_ids uuid[],
  p_cutoffs  timestamptz[]
) RETURNS TABLE (crew_id uuid, unread_count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT m.crew_id, COUNT(*)::bigint AS unread_count
  FROM unnest(p_crew_ids, p_cutoffs) AS u(cid, cutoff)
  JOIN messages m
    ON m.crew_id        = u.cid
   AND m.created_at     > u.cutoff
   AND m.message_type  <> 'system'
   AND m.user_id        <> auth.uid()
  GROUP BY m.crew_id
$$;

-- get_crew_member_msg_counts: replaces N parallel count queries in the group profile sheet
-- with one RPC that returns a per-member message count for a single crew.
CREATE OR REPLACE FUNCTION get_crew_member_msg_counts(p_crew_id uuid)
RETURNS TABLE (user_id uuid, msg_count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT m.user_id, COUNT(*)::bigint AS msg_count
  FROM messages m
  WHERE m.crew_id        = p_crew_id
    AND m.message_type  <> 'system'
  GROUP BY m.user_id
$$;
