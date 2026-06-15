-- Allow users to update image_url and image_blur_hash on their own messages.
-- This covers the fire-and-forget blur-hash write in ChatInput.sendImage().
CREATE POLICY "messages: users can update own image fields"
  ON messages FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Update insert_message to accept optional image fields so image messages
-- are fully written in one atomic RPC call without a follow-up UPDATE.
CREATE OR REPLACE FUNCTION insert_message(
  p_crew_id        uuid,
  p_content        text,
  p_message_type   text    DEFAULT 'text',
  p_reply_to_id    uuid    DEFAULT NULL,
  p_reply_preview  text    DEFAULT NULL,
  p_reply_username text    DEFAULT NULL,
  p_image_url      text    DEFAULT NULL,
  p_image_blur_hash text   DEFAULT NULL
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

  v_elem_type := CASE
    WHEN p_message_type = 'reaction' THEN 'shadow'
    WHEN p_message_type = 'voice'    THEN 'lightning'
    WHEN p_message_type = 'image'    THEN 'nature'
    WHEN length(p_content) < 20      THEN 'fire'
    WHEN length(p_content) > 150     THEN 'water'
    ELSE NULL
  END;

  INSERT INTO messages (crew_id, user_id, content, message_type, element_type, xp_awarded,
                        reply_to_id, reply_preview, reply_username,
                        image_url, image_blur_hash)
  VALUES (p_crew_id, v_user_id, p_content, p_message_type, v_elem_type, 0,
          p_reply_to_id, p_reply_preview, p_reply_username,
          p_image_url, p_image_blur_hash)
  RETURNING * INTO result;

  RETURN result;
END;
$$;
