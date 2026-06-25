-- Launch combat system for all users.
-- Removes the is_dev = true filter from init_combat_members so every crew member
-- with a combat class (warrior|healer|archer|rogue|mage) gets a combat row on boss spawn.

CREATE OR REPLACE FUNCTION init_combat_members(
  p_raid_id    uuid,
  p_crew_id    uuid,
  p_crew_level int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r    RECORD;
  v_hp int;
BEGIN
  FOR r IN
    SELECT cm.user_id, cm.class, cm.ability_bank, cm.stat_boosts
    FROM   crew_members cm
    WHERE  cm.crew_id = p_crew_id
      AND  cm.class  IN ('warrior','healer','archer','rogue','mage')
  LOOP
    v_hp := CASE r.class
      WHEN 'warrior' THEN round(42 * (1.0 + 0.018 * (p_crew_level - 1)))
      WHEN 'healer'  THEN round(32 * (1.0 + 0.018 * (p_crew_level - 1)))
      WHEN 'archer'  THEN round(28 * (1.0 + 0.018 * (p_crew_level - 1)))
      WHEN 'rogue'   THEN round(24 * (1.0 + 0.018 * (p_crew_level - 1)))
      WHEN 'mage'    THEN round(24 * (1.0 + 0.018 * (p_crew_level - 1)))
      ELSE 30
    END + COALESCE((r.stat_boosts->>'hp')::int, 0);

    INSERT INTO crew_combat_members
      (raid_id, user_id, class, current_hp, max_hp, ability_bank)
    VALUES
      (p_raid_id, r.user_id, r.class, v_hp, v_hp, COALESCE(r.ability_bank, 0))
    ON CONFLICT (raid_id, user_id) DO NOTHING;
  END LOOP;
END;
$$;
