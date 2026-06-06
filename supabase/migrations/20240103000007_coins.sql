-- Add coins to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0;

-- Coin log table
CREATE TABLE IF NOT EXISTS coin_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crew_id     uuid REFERENCES crews(id) ON DELETE SET NULL,
  coins       integer NOT NULL,
  source      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coin_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coin_log: users see own"
  ON coin_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "coin_log: service role insert"
  ON coin_log FOR INSERT WITH CHECK (true);

-- Atomic coin increment (SECURITY DEFINER so edge functions can call it)
CREATE OR REPLACE FUNCTION increment_user_coins(p_user_id uuid, p_amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET coins = coins + p_amount WHERE id = p_user_id;
END; $$;

-- Enable realtime on profiles so coin count updates live
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
