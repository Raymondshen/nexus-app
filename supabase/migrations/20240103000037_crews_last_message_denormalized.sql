-- Denormalize last-message preview onto crews so the home screen never joins messages.
-- A trigger keeps the three columns in sync on every non-system INSERT.

ALTER TABLE public.crews
  ADD COLUMN IF NOT EXISTS last_message_preview    text,
  ADD COLUMN IF NOT EXISTS last_message_at         timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_sender_id  uuid REFERENCES auth.users(id);

-- Trigger function: update denormalized columns after every message INSERT.
-- Skips system messages (XP log, boss events, etc.).
-- Guards against out-of-order delivery: only writes if the new message is
-- at least as recent as the current stored timestamp.
CREATE OR REPLACE FUNCTION public.update_crew_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.message_type = 'system' THEN
    RETURN NEW;
  END IF;

  UPDATE public.crews
  SET
    last_message_preview   = left(NEW.content, 80),
    last_message_at        = NEW.created_at,
    last_message_sender_id = NEW.user_id
  WHERE id = NEW.crew_id
    AND (last_message_at IS NULL OR NEW.created_at >= last_message_at);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_crew_last_message ON public.messages;
CREATE TRIGGER trg_update_crew_last_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_crew_last_message();

-- Backfill: seed last-message columns for every crew that has at least one
-- non-system message. Uses DISTINCT ON for a single efficient pass.
UPDATE public.crews c
SET
  last_message_preview   = sub.content,
  last_message_at        = sub.created_at,
  last_message_sender_id = sub.user_id
FROM (
  SELECT DISTINCT ON (crew_id)
    crew_id,
    left(content, 80) AS content,
    created_at,
    user_id
  FROM public.messages
  WHERE message_type <> 'system'
  ORDER BY crew_id, created_at DESC
) sub
WHERE c.id = sub.crew_id;

-- Publish crews to the Supabase Realtime WAL publication so HomeClient can
-- subscribe to UPDATE events for the denormalized preview columns.
ALTER PUBLICATION supabase_realtime ADD TABLE public.crews;
