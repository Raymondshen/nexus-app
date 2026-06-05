-- get_member_crew_stats: returns message count + total XP for one member in one crew.
-- Used by the chatroom member profile page. Single round-trip replaces two separate queries.
-- Returns exactly one row (COUNT is always non-null; COALESCE handles users with 0 XP).
CREATE OR REPLACE FUNCTION get_member_crew_stats(p_crew_id uuid, p_user_id uuid)
RETURNS TABLE (msg_count bigint, total_xp bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    (SELECT COUNT(*)::bigint
       FROM messages
      WHERE crew_id      = p_crew_id
        AND user_id      = p_user_id
        AND message_type <> 'system')       AS msg_count,
    COALESCE(
      (SELECT SUM(xp_amount)::bigint
         FROM crew_xp_log
        WHERE crew_id = p_crew_id
          AND user_id = p_user_id),
    0)                                      AS total_xp
$$;
