-- client_errors: captures unhandled JS errors and console.error calls from
-- authenticated (non-anonymous) users. Readable only via service role (dev tool).

CREATE TABLE IF NOT EXISTS client_errors (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  username   text,
  email      text,
  message    text        NOT NULL,
  stack      text,
  url        text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own error logs
CREATE POLICY "users_insert_own_errors" ON client_errors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No SELECT policy for regular users — reads go through service role only
