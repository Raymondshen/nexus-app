-- =============================================================================
-- REMOVE COMBAT SYSTEM (boss fights, raids, artifacts)
-- =============================================================================
-- WHY: Product decision to drop the boss-fight/raid feature entirely. It was
--   already effectively dormant — `nexus_combat_system` had no in-app toggle,
--   reachable only via raw devtools localStorage, and the dev "Combat Testing"
--   panel had already been removed from the Developer Settings UI in an
--   earlier pass (see profile/developer/actions.ts orphan note).
--
-- Combat classes (warrior/healer/archer/rogue/mage) are KEPT as flavor-only
-- onboarding choices — `crew_members.class` and its values are untouched.
-- Only the raid/HP/ability-charge machinery built on top of them is removed.
--
-- Order matters: crew_combat_members → active_raids → bosses (FK chain),
-- artifacts → bosses, revive_tokens → crews. Drop children before parents.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Auto-join trigger — inserted a crew_combat_members row whenever a member
--    joined a crew with an active raid, or picked a combat class.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS crew_members_auto_join_raid_insert ON crew_members;
DROP TRIGGER IF EXISTS crew_members_auto_join_raid_update ON crew_members;
DROP FUNCTION IF EXISTS auto_join_active_raid();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Combat RPCs
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS damage_raid(uuid, integer, uuid);
DROP FUNCTION IF EXISTS apply_boss_damage(uuid, uuid, integer);
DROP FUNCTION IF EXISTS init_combat_members(uuid, uuid, integer);
DROP FUNCTION IF EXISTS use_revive_token(uuid, uuid);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tables (children first)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS crew_combat_members;
DROP TABLE IF EXISTS revive_tokens;
DROP TABLE IF EXISTS active_raids;
DROP TABLE IF EXISTS artifacts;
DROP TABLE IF EXISTS bosses;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. crew_members columns that only ever fed combat (ability bank + stat
--    boosts earned on boss defeat). `class` itself stays — kept as a
--    flavor-only onboarding choice.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE crew_members
  DROP COLUMN IF EXISTS ability_bank,
  DROP COLUMN IF EXISTS stat_boosts;
