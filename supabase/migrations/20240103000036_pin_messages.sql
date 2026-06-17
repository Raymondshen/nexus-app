-- Pin feature: add pin columns to messages, protect them from direct writes,
-- and create admin-only pin_message / unpin_message RPCs.

-- 1. Add pin columns
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS pinned          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_at       timestamptz,
  ADD COLUMN IF NOT EXISTS pin_expires_at  timestamptz;

-- 2. Partial index — fast lookup of active pins per crew
CREATE INDEX IF NOT EXISTS messages_pinned_crew_id
  ON messages(crew_id)
  WHERE pinned = true;

-- 3. Trigger to block direct client writes to pin columns.
--    Inside a SECURITY DEFINER function owned by postgres, current_user = 'postgres'.
--    Direct authenticated client calls run as current_user = 'authenticated'.
CREATE OR REPLACE FUNCTION messages_protect_pin_columns()
RETURNS trigger AS $$
BEGIN
  IF current_user != 'postgres' THEN
    IF (
      (NEW.pinned IS DISTINCT FROM OLD.pinned) OR
      (NEW.pinned_by IS DISTINCT FROM OLD.pinned_by) OR
      (NEW.pinned_at IS DISTINCT FROM OLD.pinned_at) OR
      (NEW.pin_expires_at IS DISTINCT FROM OLD.pin_expires_at)
    ) THEN
      RAISE EXCEPTION 'pin fields are managed through pin_message and unpin_message RPCs';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_protect_pin_columns_trigger
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION messages_protect_pin_columns();

-- 4. pin_message RPC — admin-only, enforces per-crew cap (5) and duration bounds (~1 year)
DROP FUNCTION IF EXISTS pin_message(uuid, integer);
CREATE FUNCTION pin_message(
  p_message_id       uuid,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_crew_id   uuid;
  v_admin_id  uuid;
  v_pin_count integer;
  v_expires   timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT crew_id INTO v_crew_id
  FROM messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found';
  END IF;

  IF NOT is_crew_member(v_crew_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  -- Admin = earliest joiner in the crew
  SELECT user_id INTO v_admin_id
  FROM crew_members
  WHERE crew_id = v_crew_id
  ORDER BY joined_at ASC NULLS LAST
  LIMIT 1;

  IF v_admin_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'only_admin';
  END IF;

  IF p_duration_minutes IS NOT NULL THEN
    IF p_duration_minutes <= 0 OR p_duration_minutes > 525960 THEN
      RAISE EXCEPTION 'invalid_duration';
    END IF;
    v_expires := now() + make_interval(mins => p_duration_minutes);
  END IF;

  -- Enforce per-crew pin cap
  SELECT COUNT(*) INTO v_pin_count
  FROM messages
  WHERE crew_id = v_crew_id
    AND pinned = true
    AND (pin_expires_at IS NULL OR pin_expires_at > now());

  IF v_pin_count >= 5 THEN
    RAISE EXCEPTION 'pin_cap_exceeded';
  END IF;

  UPDATE messages
  SET
    pinned         = true,
    pinned_by      = v_user_id,
    pinned_at      = now(),
    pin_expires_at = v_expires
  WHERE id = p_message_id;

  RETURN jsonb_build_object(
    'pinned',         true,
    'message_id',     p_message_id,
    'pin_expires_at', v_expires
  );
END;
$$;

-- 5. unpin_message RPC — admin-only
DROP FUNCTION IF EXISTS unpin_message(uuid);
CREATE FUNCTION unpin_message(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_crew_id  uuid;
  v_admin_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT crew_id INTO v_crew_id
  FROM messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found';
  END IF;

  IF NOT is_crew_member(v_crew_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  SELECT user_id INTO v_admin_id
  FROM crew_members
  WHERE crew_id = v_crew_id
  ORDER BY joined_at ASC NULLS LAST
  LIMIT 1;

  IF v_admin_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'only_admin';
  END IF;

  UPDATE messages
  SET
    pinned         = false,
    pinned_by      = NULL,
    pinned_at      = NULL,
    pin_expires_at = NULL
  WHERE id = p_message_id;

  RETURN jsonb_build_object('unpinned', true, 'message_id', p_message_id);
END;
$$;
