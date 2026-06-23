-- =============================================================================
-- Nexus — Phase 2 Combat System
-- Dev-gated: combat rows only created for profiles.is_dev = true members
-- =============================================================================

-- 1. Extend active_raids with combat scheduling columns
-- =============================================================================
ALTER TABLE active_raids
  ADD COLUMN IF NOT EXISTS last_boss_attack_at  timestamptz,
  ADD COLUMN IF NOT EXISTS guard_user_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guard_expires_at      timestamptz,
  ADD COLUMN IF NOT EXISTS volley_expires_at     timestamptz;


-- 2. crew_combat_members — per-raid, per-member HP/MP + state
-- =============================================================================
CREATE TABLE IF NOT EXISTS crew_combat_members (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  raid_id          uuid        NOT NULL REFERENCES active_raids(id)  ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES profiles(id)       ON DELETE CASCADE,
  class            text        NOT NULL,
  current_hp       integer     NOT NULL,
  max_hp           integer     NOT NULL,
  current_mp       integer     NOT NULL DEFAULT 0,
  max_mp           integer     NOT NULL,
  is_downed        boolean     NOT NULL DEFAULT false,
  downed_at        timestamptz,
  guard_expires_at timestamptz,             -- Warrior DEF +40% window
  momentum_stack   integer     NOT NULL DEFAULT 0,  -- Rogue consecutive-message counter
  last_msg_at      timestamptz,             -- Rogue 1-hr decay anchor
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (raid_id, user_id)
);

ALTER TABLE crew_combat_members ENABLE ROW LEVEL SECURITY;

-- Members of the crew that owns the raid can read combat state
CREATE POLICY "crew_combat_members: crew members can read"
  ON crew_combat_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   active_raids ar
      JOIN   crew_members cm ON cm.crew_id = ar.crew_id
      WHERE  ar.id          = crew_combat_members.raid_id
        AND  cm.user_id     = auth.uid()
    )
  );

-- All writes come from Edge Functions via service role (no client INSERT/UPDATE policy needed)

-- Add to realtime so clients get live HP/MP updates
ALTER PUBLICATION supabase_realtime ADD TABLE crew_combat_members;


-- 3. revive_tokens — per-crew consumable (5 free, 20 coins each after)
-- =============================================================================
CREATE TABLE IF NOT EXISTS revive_tokens (
  crew_id uuid PRIMARY KEY REFERENCES crews(id) ON DELETE CASCADE,
  count   integer NOT NULL DEFAULT 5
);

ALTER TABLE revive_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revive_tokens: crew members can read"
  ON revive_tokens FOR SELECT
  USING (is_crew_member(crew_id));

-- Seed 5 free tokens for every existing crew
INSERT INTO revive_tokens (crew_id, count)
SELECT id, 5 FROM crews
ON CONFLICT (crew_id) DO NOTHING;


-- 4. init_combat_members — called when a new raid spawns
--    Creates rows only for dev members (is_dev = true).
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
  v_mp        integer;
  v_base_hp   integer;
  v_base_mp   integer;
BEGIN
  -- Iterate over dev members of this crew who have a combat class assigned
  FOR r IN
    SELECT cm.user_id, cm.class
    FROM   crew_members cm
    JOIN   profiles p ON p.id = cm.user_id
    WHERE  cm.crew_id = p_crew_id
      AND  p.is_dev   = true
      AND  cm.class   IN ('warrior','healer','archer','rogue','mage')
  LOOP
    -- Base HP / MP per class (Level 1 values; scaled by formula below)
    CASE r.class
      WHEN 'warrior' THEN v_base_hp := 42; v_base_mp := 60;
      WHEN 'healer'  THEN v_base_hp := 32; v_base_mp := 80;
      WHEN 'archer'  THEN v_base_hp := 28; v_base_mp := 65;
      WHEN 'rogue'   THEN v_base_hp := 24; v_base_mp := 55;
      WHEN 'mage'    THEN v_base_hp := 24; v_base_mp := 85;
      ELSE                v_base_hp := 30; v_base_mp := 60;
    END CASE;

    -- statAtLevel(base, N) = round(base * (1 + 0.018 * (N - 1)))
    v_hp := round(v_base_hp * (1.0 + 0.018 * (p_crew_level - 1)));
    v_mp := round(v_base_mp * (1.0 + 0.018 * (p_crew_level - 1)));

    INSERT INTO crew_combat_members
      (raid_id, user_id, class, current_hp, max_hp, current_mp, max_mp)
    VALUES
      (p_raid_id, r.user_id, r.class, v_hp, v_hp, 0, v_mp)
    ON CONFLICT (raid_id, user_id) DO NOTHING;
  END LOOP;

  -- Ensure revive_tokens row exists for the crew
  INSERT INTO revive_tokens (crew_id, count)
  VALUES (p_crew_id, 5)
  ON CONFLICT (crew_id) DO NOTHING;
END;
$$;


-- 5. apply_boss_damage — atomic boss-to-member hit
--    p_final_dmg is already computed (phase mult + DEF reduction done in edge fn)
-- =============================================================================
CREATE OR REPLACE FUNCTION apply_boss_damage(
  p_raid_id    uuid,
  p_member_id  uuid,
  p_final_dmg  integer
)
RETURNS TABLE(new_hp integer, is_downed boolean, downed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_hp integer;
  v_new_hp     integer;
  v_downed     boolean;
  v_downed_at  timestamptz;
BEGIN
  SELECT current_hp
    INTO v_current_hp
  FROM   crew_combat_members
  WHERE  raid_id = p_raid_id AND user_id = p_member_id;

  -- Already downed or not in raid — return current state unchanged
  IF v_current_hp IS NULL OR v_current_hp <= 0 THEN
    RETURN QUERY
      SELECT COALESCE(v_current_hp, 0), true, now();
    RETURN;
  END IF;

  v_new_hp    := greatest(0, v_current_hp - p_final_dmg);
  v_downed    := v_new_hp = 0;
  v_downed_at := CASE WHEN v_downed THEN now() ELSE NULL END;

  UPDATE crew_combat_members
  SET    current_hp = v_new_hp,
         is_downed  = v_downed,
         downed_at  = v_downed_at
  WHERE  raid_id  = p_raid_id
    AND  user_id  = p_member_id;

  RETURN QUERY SELECT v_new_hp, v_downed, v_downed_at;
END;
$$;


-- 6. use_revive_token — spends a token, restores target to full HP
-- =============================================================================
CREATE OR REPLACE FUNCTION use_revive_token(
  p_raid_id        uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_crew_id       uuid;
  v_tokens        integer;
  v_max_hp        integer;
BEGIN
  SELECT crew_id INTO v_crew_id
  FROM   active_raids WHERE id = p_raid_id;

  IF v_crew_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Raid not found');
  END IF;

  -- Caller must be a crew member
  IF NOT is_crew_member(v_crew_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a crew member');
  END IF;

  SELECT count INTO v_tokens
  FROM   revive_tokens WHERE crew_id = v_crew_id;

  IF v_tokens IS NULL OR v_tokens <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No revive tokens remaining');
  END IF;

  SELECT max_hp INTO v_max_hp
  FROM   crew_combat_members
  WHERE  raid_id = p_raid_id AND user_id = p_target_user_id AND is_downed = true;

  IF v_max_hp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target is not downed');
  END IF;

  -- Atomic: deduct token + restore HP
  UPDATE revive_tokens SET count = count - 1 WHERE crew_id = v_crew_id;

  UPDATE crew_combat_members
  SET    current_hp = v_max_hp,
         is_downed  = false,
         downed_at  = null
  WHERE  raid_id = p_raid_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object(
    'ok',               true,
    'new_hp',           v_max_hp,
    'tokens_remaining', v_tokens - 1
  );
END;
$$;


-- 7. Declare new RPCs in the Database type (handled in index.ts)
--    Nothing to do here — just noting the coupling.

-- 8. Index for fast per-raid member lookups
CREATE INDEX IF NOT EXISTS crew_combat_members_raid_id ON crew_combat_members(raid_id);
CREATE INDEX IF NOT EXISTS crew_combat_members_user_id ON crew_combat_members(user_id);
