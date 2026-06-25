-- Auto-join members into an active raid when they join a crew or select a combat class.
-- Covers two scenarios:
--   1. INSERT on crew_members (user joins a crew that already has an active raid)
--   2. UPDATE on crew_members.class to a combat class (user completes onboarding class select)

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
  IF NEW.class NOT IN ('warrior','healer','archer','rogue','mage') THEN
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

-- Trigger for new crew members (e.g. user joins a crew that has an active raid)
DROP TRIGGER IF EXISTS crew_members_auto_join_raid_insert ON crew_members;
CREATE TRIGGER crew_members_auto_join_raid_insert
AFTER INSERT ON crew_members
FOR EACH ROW
EXECUTE FUNCTION auto_join_active_raid();

-- Trigger for class updates (e.g. user selects a combat class during onboarding)
DROP TRIGGER IF EXISTS crew_members_auto_join_raid_update ON crew_members;
CREATE TRIGGER crew_members_auto_join_raid_update
AFTER UPDATE OF class ON crew_members
FOR EACH ROW
EXECUTE FUNCTION auto_join_active_raid();
