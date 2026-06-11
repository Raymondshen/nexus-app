-- ─── Polls Feature ────────────────────────────────────────────────────────────

-- 1. Update message_type check constraint to include 'poll'
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'voice', 'image', 'reaction', 'system', 'poll'));

-- 2. Create polls table
CREATE TABLE polls (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid        REFERENCES messages(id) ON DELETE CASCADE,
  crew_id    uuid        NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  creator_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question   text        NOT NULL CHECK (length(question) BETWEEN 1 AND 200),
  options    jsonb       NOT NULL,
  votes      jsonb       NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  closed_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;

-- Crew members can read polls in their crews
CREATE POLICY "polls: crew members can select"
  ON polls FOR SELECT
  USING (is_crew_member(crew_id));

-- Add to realtime publication so vote/close changes propagate live
ALTER PUBLICATION supabase_realtime ADD TABLE polls;

-- 3. create_poll: atomically inserts a message + poll row, returns the message
CREATE OR REPLACE FUNCTION create_poll(
  p_crew_id    uuid,
  p_question   text,
  p_options    jsonb,
  p_expires_at timestamptz
) RETURNS messages
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_message_id uuid;
  v_poll_id    uuid;
  v_result     messages%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT is_crew_member(p_crew_id) THEN RAISE EXCEPTION 'Not a crew member'; END IF;
  IF jsonb_array_length(p_options) < 2 THEN RAISE EXCEPTION 'At least 2 options required'; END IF;
  IF jsonb_array_length(p_options) > 5 THEN RAISE EXCEPTION 'Maximum 5 options allowed'; END IF;
  IF p_expires_at <= now() THEN RAISE EXCEPTION 'Expiry must be in the future'; END IF;

  -- Insert the chat message with a placeholder content
  INSERT INTO messages (crew_id, user_id, content, message_type, element_type, xp_awarded)
  VALUES (p_crew_id, v_user_id, '', 'poll', 'arcane', 0)
  RETURNING id INTO v_message_id;

  -- Insert the poll row linked to the message
  INSERT INTO polls (message_id, crew_id, creator_id, question, options, expires_at)
  VALUES (v_message_id, p_crew_id, v_user_id, p_question, p_options, p_expires_at)
  RETURNING id INTO v_poll_id;

  -- Stamp the message content with the poll id so clients can resolve it
  UPDATE messages SET content = 'POLL:' || v_poll_id::text WHERE id = v_message_id;

  SELECT * INTO v_result FROM messages WHERE id = v_message_id;
  RETURN v_result;
END;
$$;

-- 4. vote_on_poll: toggle a user's vote on one option (one vote per poll per user)
CREATE OR REPLACE FUNCTION vote_on_poll(
  p_poll_id      uuid,
  p_option_index int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_poll           polls%ROWTYPE;
  v_votes          jsonb;
  v_option_key     text := p_option_index::text;
  v_current_option int;
  v_current_key    text;
  v_arr            jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_poll FROM polls WHERE id = p_poll_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Poll not found'; END IF;
  IF v_poll.closed_at IS NOT NULL OR v_poll.expires_at < now() THEN
    RAISE EXCEPTION 'Poll is closed';
  END IF;
  IF NOT is_crew_member(v_poll.crew_id) THEN RAISE EXCEPTION 'Not a crew member'; END IF;
  IF p_option_index < 0 OR p_option_index >= jsonb_array_length(v_poll.options) THEN
    RAISE EXCEPTION 'Invalid option index';
  END IF;

  v_votes := v_poll.votes;

  -- Determine which option the user has already voted for, if any
  SELECT key::int INTO v_current_option
  FROM jsonb_each(v_votes) AS t(key, value)
  WHERE v_user_id::text = ANY(SELECT jsonb_array_elements_text(t.value))
  LIMIT 1;

  IF v_current_option = p_option_index THEN
    -- Same option clicked again: toggle vote off
    v_arr := COALESCE(
      (SELECT jsonb_agg(x) FROM jsonb_array_elements_text(v_votes->v_option_key) x WHERE x <> v_user_id::text),
      '[]'::jsonb
    );
    IF jsonb_array_length(v_arr) = 0 THEN
      v_votes := v_votes - v_option_key;
    ELSE
      v_votes := jsonb_set(v_votes, ARRAY[v_option_key], v_arr);
    END IF;
  ELSE
    -- Remove user from their previous option (if any)
    IF v_current_option IS NOT NULL THEN
      v_current_key := v_current_option::text;
      v_arr := COALESCE(
        (SELECT jsonb_agg(x) FROM jsonb_array_elements_text(v_votes->v_current_key) x WHERE x <> v_user_id::text),
        '[]'::jsonb
      );
      IF jsonb_array_length(v_arr) = 0 THEN
        v_votes := v_votes - v_current_key;
      ELSE
        v_votes := jsonb_set(v_votes, ARRAY[v_current_key], v_arr);
      END IF;
    END IF;

    -- Add vote to the new option
    IF v_votes ? v_option_key THEN
      v_votes := jsonb_set(
        v_votes, ARRAY[v_option_key],
        (v_votes->v_option_key) || jsonb_build_array(v_user_id::text)
      );
    ELSE
      v_votes := jsonb_set(v_votes, ARRAY[v_option_key], jsonb_build_array(v_user_id::text));
    END IF;
  END IF;

  UPDATE polls SET votes = v_votes WHERE id = p_poll_id;
  RETURN v_votes;
END;
$$;

-- 5. close_poll: creator manually closes the poll before expiry
CREATE OR REPLACE FUNCTION close_poll(p_poll_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE polls
  SET    closed_at = now()
  WHERE  id        = p_poll_id
    AND  creator_id = auth.uid()
    AND  closed_at  IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll not found, already closed, or not authorized';
  END IF;
END;
$$;
