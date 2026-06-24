-- Collapse to single phase: damage_raid no longer computes or updates
-- active_raids.phase — it always returns 1. The column stays (always=1)
-- so existing SELECT queries and TypeScript types need no changes.

CREATE OR REPLACE FUNCTION damage_raid(
  p_raid_id uuid,
  p_damage  integer,
  p_user_id uuid
)
RETURNS TABLE(current_hp integer, phase integer, defeated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_hp   integer;
  v_defeated timestamptz;
BEGIN
  -- Atomically decrement HP (only if not yet defeated)
  -- Qualify active_raids.defeated_at to avoid ambiguity with RETURNS TABLE output column
  UPDATE active_raids
  SET current_hp = GREATEST(0, active_raids.current_hp - p_damage)
  WHERE id = p_raid_id
    AND active_raids.defeated_at IS NULL
  RETURNING active_raids.current_hp INTO v_new_hp;

  IF v_new_hp IS NULL THEN
    -- Raid already defeated or not found
    SELECT ar.current_hp, ar.defeated_at
      INTO v_new_hp, v_defeated
    FROM active_raids ar WHERE ar.id = p_raid_id;
    RETURN QUERY SELECT COALESCE(v_new_hp, 0), 1::integer, v_defeated;
    RETURN;
  END IF;

  v_defeated := NULL;
  IF v_new_hp = 0 THEN
    v_defeated := NOW();
    UPDATE active_raids
    SET defeated_at = v_defeated,
        mvp_user_id = p_user_id
    WHERE id = p_raid_id;
  END IF;

  RETURN QUERY SELECT v_new_hp, 1::integer, v_defeated;
END;
$$;
