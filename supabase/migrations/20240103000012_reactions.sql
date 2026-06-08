-- Add JSONB reactions column to messages.
-- Schema: { emoji: [userId, userId, ...] }
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- toggle_reaction: atomically adds or removes a user from an emoji's array.
-- Removes the key entirely when the array becomes empty.
-- Uses SELECT ... FOR UPDATE to serialise concurrent reaction toggles on the same row.
CREATE OR REPLACE FUNCTION toggle_reaction(
  p_message_id uuid,
  p_emoji      text,
  p_user_id    uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_reactions jsonb;
  v_arr       jsonb;
  v_user_str  text := p_user_id::text;
BEGIN
  SELECT reactions
  INTO   v_reactions
  FROM   messages
  WHERE  id = p_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found: %', p_message_id;
  END IF;

  v_arr := COALESCE(v_reactions -> p_emoji, '[]'::jsonb);

  IF v_arr @> to_jsonb(v_user_str) THEN
    -- Remove caller from array
    SELECT COALESCE(jsonb_agg(el), '[]'::jsonb)
    INTO   v_arr
    FROM   jsonb_array_elements(v_arr) el
    WHERE  el <> to_jsonb(v_user_str);
  ELSE
    -- Add caller to array
    v_arr := v_arr || jsonb_build_array(v_user_str);
  END IF;

  IF jsonb_array_length(v_arr) = 0 THEN
    v_reactions := v_reactions - p_emoji;
  ELSE
    v_reactions := jsonb_set(COALESCE(v_reactions, '{}'::jsonb), ARRAY[p_emoji], v_arr);
  END IF;

  UPDATE messages SET reactions = v_reactions WHERE id = p_message_id;
  RETURN v_reactions;
END;
$$;
