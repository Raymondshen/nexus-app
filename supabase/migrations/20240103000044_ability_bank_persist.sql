-- Ability Bank persistence across raids
-- Adds ability_bank to crew_members so the bank survives between raid sessions.
-- init_combat_members seeds new raid rows from this value.
-- attack-boss syncs both tables on every earn/spend.

ALTER TABLE crew_members
  ADD COLUMN IF NOT EXISTS ability_bank integer NOT NULL DEFAULT 0;

-- Backfill crew_members.ability_bank from historical eligible messages
-- Eligible: text ≥5 chars OR image, not an exact repeat of sender's prior message in the same crew
UPDATE crew_members cm
SET ability_bank = COALESCE(sub.earned, 0)
FROM (
  SELECT
    user_id,
    crew_id,
    COUNT(*) AS earned
  FROM (
    SELECT
      user_id,
      crew_id,
      content,
      message_type,
      LAG(content) OVER (PARTITION BY crew_id, user_id ORDER BY created_at) AS prev_content
    FROM messages
    WHERE message_type IN ('text', 'image')
  ) m
  WHERE
    -- Not an exact repeat
    (prev_content IS NULL OR content != prev_content)
    -- Text must be ≥5 chars; images always count
    AND (message_type = 'image' OR length(content) >= 5)
  GROUP BY user_id, crew_id
) sub
WHERE cm.user_id = sub.user_id
  AND cm.crew_id = sub.crew_id;

-- Sync current active raid rows to match crew_members.ability_bank
UPDATE crew_combat_members ccm
SET ability_bank = cm.ability_bank
FROM crew_members cm,
     active_raids ar
WHERE ar.id = ccm.raid_id
  AND cm.crew_id = ar.crew_id
  AND cm.user_id = ccm.user_id;

-- Replace init_combat_members to seed ability_bank from crew_members
CREATE OR REPLACE FUNCTION init_combat_members(
  p_raid_id   uuid,
  p_crew_id   uuid,
  p_crew_level int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_hp int;
BEGIN
  FOR r IN
    SELECT cm.user_id, cm.class, cm.ability_bank
    FROM   crew_members cm
    JOIN   profiles p ON p.id = cm.user_id
    WHERE  cm.crew_id = p_crew_id
      AND  p.is_dev   = true
      AND  cm.class  IN ('warrior','healer','archer','rogue','mage')
  LOOP
    -- Scale HP by crew level (mirrors statsAtLevel formula)
    v_hp := CASE r.class
      WHEN 'warrior' THEN round(42 * (1 + 0.018 * (p_crew_level - 1)))
      WHEN 'healer'  THEN round(32 * (1 + 0.018 * (p_crew_level - 1)))
      WHEN 'archer'  THEN round(28 * (1 + 0.018 * (p_crew_level - 1)))
      WHEN 'rogue'   THEN round(24 * (1 + 0.018 * (p_crew_level - 1)))
      WHEN 'mage'    THEN round(24 * (1 + 0.018 * (p_crew_level - 1)))
      ELSE 30
    END;

    INSERT INTO crew_combat_members
      (raid_id, user_id, class, current_hp, max_hp, ability_bank)
    VALUES
      (p_raid_id, r.user_id, r.class, v_hp, v_hp, COALESCE(r.ability_bank, 0))
    ON CONFLICT (raid_id, user_id) DO NOTHING;
  END LOOP;
END;
$$;
