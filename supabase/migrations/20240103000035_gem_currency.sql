-- ─── Gem currency — premium cosmetic currency, one daily claim per device-local day ─
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gem_balance     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_gem_claim  timestamptz;

-- profiles already has "profiles: anyone can read" (SELECT using true), which
-- covers reading these two columns. The existing "profiles: owner can update"
-- policy has no column restriction, so a client could otherwise write
-- gem_balance/last_gem_claim directly — block that here. Only the Edge
-- Function (service role) may change these two columns.
CREATE OR REPLACE FUNCTION prevent_client_gem_writes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.gem_balance IS DISTINCT FROM OLD.gem_balance
       OR NEW.last_gem_claim IS DISTINCT FROM OLD.last_gem_claim THEN
      RAISE EXCEPTION 'gem_balance and last_gem_claim can only be modified by the server';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_protect_gem_columns ON profiles;
CREATE TRIGGER profiles_protect_gem_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_client_gem_writes();

-- ─── Atomic daily claim RPC (called by award-gem Edge Function) ─────────────
-- Single UPDATE guarded by the WHERE clause avoids a fetch-then-update race:
-- only rows whose last_gem_claim predates the caller's local midnight qualify.
CREATE OR REPLACE FUNCTION claim_daily_gem(
  p_user_id        uuid,
  p_local_midnight timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE profiles
  SET gem_balance    = gem_balance + 1,
      last_gem_claim = now()
  WHERE id = p_user_id
    AND (last_gem_claim IS NULL OR last_gem_claim < p_local_midnight)
  RETURNING gem_balance INTO v_new_balance;

  IF v_new_balance IS NOT NULL THEN
    RETURN jsonb_build_object('claimed', true, 'gem_balance', v_new_balance);
  END IF;

  SELECT gem_balance INTO v_new_balance FROM profiles WHERE id = p_user_id;
  RETURN jsonb_build_object('claimed', false, 'gem_balance', COALESCE(v_new_balance, 0));
END; $$;
