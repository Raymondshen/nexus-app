-- Drop the two old overloads of insert_message that conflict with the
-- 8-param version added in migration 031.  Having multiple overloads with
-- all-DEFAULT args makes every RPC call ambiguous and breaks message sending.

DROP FUNCTION IF EXISTS public.insert_message(uuid, text, text);
DROP FUNCTION IF EXISTS public.insert_message(uuid, text, text, uuid, text, text);
