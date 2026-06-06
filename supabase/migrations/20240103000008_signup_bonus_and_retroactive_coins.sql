-- =============================================================================
-- Signup bonus + retroactive coin award
-- =============================================================================

-- 1. Update handle_new_user: grant 50 coins to every new Google/anon signup
-- =============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url, coins)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    50
  );
  INSERT INTO public.coin_log (user_id, coins, source)
  VALUES (NEW.id, 50, 'signup_bonus');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. One-time retroactive award for all existing users
--    Guard: skip any user who already has a 'signup_bonus' coin_log entry.
--    Award:
--      • 50 coins  — signup bonus
--      • 1 coin    — per text message
--      • 3 coins   — per voice message
--      • 2 coins   — per image message
--      (reactions and system messages earn 0)
-- =============================================================================
DO $$
DECLARE
  r            RECORD;
  v_msg_coins  integer;
  v_total      integer;
BEGIN
  FOR r IN
    SELECT p.id
    FROM   profiles p
    WHERE  NOT EXISTS (
      SELECT 1 FROM coin_log cl
      WHERE  cl.user_id = p.id AND cl.source = 'signup_bonus'
    )
  LOOP
    SELECT COALESCE(
        COUNT(*) FILTER (WHERE message_type = 'text')  * 1 +
        COUNT(*) FILTER (WHERE message_type = 'voice') * 3 +
        COUNT(*) FILTER (WHERE message_type = 'image') * 2,
      0)
    INTO  v_msg_coins
    FROM  messages
    WHERE user_id = r.id;

    v_total := 50 + v_msg_coins;

    UPDATE profiles SET coins = coins + v_total WHERE id = r.id;

    INSERT INTO coin_log (user_id, coins, source)
    VALUES (r.id, 50, 'signup_bonus');

    IF v_msg_coins > 0 THEN
      INSERT INTO coin_log (user_id, coins, source)
      VALUES (r.id, v_msg_coins, 'retroactive_messages');
    END IF;
  END LOOP;
END; $$;
