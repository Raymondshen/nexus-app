-- =============================================================================
-- Nexus — Ability Bank: replaces MP with a flat charge counter
--
-- Each eligible message (text ≥5 chars or image, not an exact repeat, not
-- soft-blocked) earns 1 Ability Bank charge.  Every ability costs 2 charges
-- regardless of class.  MP columns are dropped.
-- =============================================================================


-- 1. Add ability_bank column
-- =============================================================================
ALTER TABLE crew_combat_members
  ADD COLUMN IF NOT EXISTS ability_bank integer NOT NULL DEFAULT 0;


-- 2. Replace init_combat_members — removes MP fields
-- =============================================================================
CREATE OR REPLACE FUNCTION init_combat_members(
  p_raid_id    uuid,
  p_crew_id    uuid,
  p_crew_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r           RECORD;
  v_hp        integer;
  v_base_hp   integer;
BEGIN
  FOR r IN
    SELECT cm.user_id, cm.class
    FROM   crew_members cm
    JOIN   profiles p ON p.id = cm.user_id
    WHERE  cm.crew_id = p_crew_id
      AND  p.is_dev   = true
      AND  cm.class   IN ('warrior','healer','archer','rogue','mage')
  LOOP
    CASE r.class
      WHEN 'warrior' THEN v_base_hp := 42;
      WHEN 'healer'  THEN v_base_hp := 32;
      WHEN 'archer'  THEN v_base_hp := 28;
      WHEN 'rogue'   THEN v_base_hp := 24;
      WHEN 'mage'    THEN v_base_hp := 24;
      ELSE                v_base_hp := 30;
    END CASE;

    v_hp := round(v_base_hp * (1.0 + 0.018 * (p_crew_level - 1)));

    INSERT INTO crew_combat_members
      (raid_id, user_id, class, current_hp, max_hp, ability_bank)
    VALUES
      (p_raid_id, r.user_id, r.class, v_hp, v_hp, 0)
    ON CONFLICT (raid_id, user_id) DO NOTHING;
  END LOOP;

  INSERT INTO revive_tokens (crew_id, count)
  VALUES (p_crew_id, 5)
  ON CONFLICT (crew_id) DO NOTHING;
END;
$$;


-- 3. Drop MP columns (function above no longer references them)
-- =============================================================================
ALTER TABLE crew_combat_members
  DROP COLUMN IF EXISTS current_mp,
  DROP COLUMN IF EXISTS max_mp;


-- 4. One-time backfill: seed existing combat member rows with their historical
--    eligible message count (text ≥5 chars or image, no exact adjacent repeat).
--    This is a flat 1:1 count — no rate decay applied retroactively.
--
--    Note: only active crew_combat_members rows are updated (per-raid table).
--    The backfill covers all historical messages for the crew, so existing dev
--    users get a meaningful starting balance for the current raid.
-- =============================================================================
WITH ranked AS (
  SELECT
    m.crew_id,
    m.user_id,
    m.content,
    m.message_type,
    LAG(m.content) OVER (
      PARTITION BY m.crew_id, m.user_id
      ORDER BY m.created_at
    ) AS prev_content
  FROM messages m
  WHERE m.message_type IN ('text', 'image')
),
eligible AS (
  SELECT crew_id, user_id, COUNT(*) AS bank_count
  FROM ranked
  WHERE (
    (
      message_type = 'text'
      AND char_length(COALESCE(content, '')) >= 5
      AND (prev_content IS NULL OR content IS DISTINCT FROM prev_content)
    )
    OR
    (
      message_type = 'image'
      AND (prev_content IS NULL OR content IS DISTINCT FROM prev_content)
    )
  )
  GROUP BY crew_id, user_id
)
UPDATE crew_combat_members ccm
SET ability_bank = COALESCE((
  SELECT e.bank_count
  FROM eligible e
  JOIN active_raids ar ON ar.id = ccm.raid_id
  WHERE e.crew_id = ar.crew_id
    AND e.user_id = ccm.user_id
), 0);
