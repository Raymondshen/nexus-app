-- Fix: NULL NOT IN (...) evaluates to NULL in PL/pgSQL, not TRUE.
-- When a user joins a crew their class is NULL until they pick one;
-- the missing IS NULL check caused the trigger to fall through and attempt
-- to INSERT into crew_combat_members with class = NULL, violating NOT NULL.

CREATE OR REPLACE FUNCTION auto_join_active_raid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_raid_id  uuid;
  v_level    int;
  v_hp       int;
BEGIN
  -- Only act when the final class is a combat class
  IF NEW.class IS NULL OR NEW.class NOT IN ('warrior','healer','archer','rogue','mage') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only act when class actually changed to a combat class
  IF TG_OP = 'UPDATE' AND OLD.class = NEW.class THEN
    RETURN NEW;
  END IF;

  -- Find an active (non-expired, non-defeated) raid for this crew
  SELECT ar.id, c.level
  INTO   v_raid_id, v_level
  FROM   active_raids ar
  JOIN   crews c ON c.id = ar.crew_id
  WHERE  ar.crew_id    = NEW.crew_id
    AND  ar.defeated_at IS NULL
    AND  ar.expires_at  > now()
  LIMIT 1;

  IF v_raid_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate level-scaled HP + any HP stat boost already earned
  v_hp := CASE NEW.class
    WHEN 'warrior' THEN round(42 * (1.0 + 0.018 * (v_level - 1)))
    WHEN 'healer'  THEN round(32 * (1.0 + 0.018 * (v_level - 1)))
    WHEN 'archer'  THEN round(28 * (1.0 + 0.018 * (v_level - 1)))
    WHEN 'rogue'   THEN round(24 * (1.0 + 0.018 * (v_level - 1)))
    WHEN 'mage'    THEN round(24 * (1.0 + 0.018 * (v_level - 1)))
    ELSE 30
  END + COALESCE((NEW.stat_boosts->>'hp')::int, 0);

  INSERT INTO crew_combat_members
    (raid_id, user_id, class, current_hp, max_hp, ability_bank)
  VALUES
    (v_raid_id, NEW.user_id, NEW.class, v_hp, v_hp, COALESCE(NEW.ability_bank, 0))
  ON CONFLICT (raid_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
