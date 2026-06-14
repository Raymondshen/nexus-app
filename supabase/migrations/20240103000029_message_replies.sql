-- Add reply context columns to messages.
-- reply_to_id:   the message being replied to (SET NULL on delete)
-- reply_preview: cached first 100 chars of the original content (avoids join)
-- reply_username: cached username of the original author (avoids join)

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id    uuid REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_preview  text,
  ADD COLUMN IF NOT EXISTS reply_username text;

-- Replace insert_message to accept optional reply metadata.
-- The function signature uses DEFAULT NULL so existing callers work unchanged.

CREATE OR REPLACE FUNCTION insert_message(
  p_crew_id        uuid,
  p_content        text,
  p_message_type   text    DEFAULT 'text',
  p_reply_to_id    uuid    DEFAULT NULL,
  p_reply_preview  text    DEFAULT NULL,
  p_reply_username text    DEFAULT NULL
)
RETURNS messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_elem_type text;
  result      messages;
BEGIN
  IF NOT is_crew_member(p_crew_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  -- Mirror the element logic from src/lib/game/xp.ts getElementType()
  v_elem_type := CASE
    WHEN p_message_type = 'reaction' THEN 'shadow'
    WHEN p_message_type = 'voice'    THEN 'lightning'
    WHEN p_message_type = 'image'    THEN 'nature'
    WHEN length(p_content) < 20      THEN 'fire'
    WHEN length(p_content) > 150     THEN 'water'
    ELSE NULL
  END;

  INSERT INTO messages (crew_id, user_id, content, message_type, element_type, xp_awarded,
                        reply_to_id, reply_preview, reply_username)
  VALUES (p_crew_id, v_user_id, p_content, p_message_type, v_elem_type, 0,
          p_reply_to_id, p_reply_preview, p_reply_username)
  RETURNING * INTO result;

  RETURN result;
END;
$$;
