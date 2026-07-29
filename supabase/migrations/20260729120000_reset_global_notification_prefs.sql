-- =============================================================================
-- RESET notification_preferences — global mute is no longer a thing
-- =============================================================================
-- CONTEXT: notification_preferences (notif_messages/notif_mentions/notif_replies)
-- was a global kill switch send-notification/index.ts ANDed with the per-crew
-- crew_notification_preferences check. The Settings-page toggle that used to write
-- this table was removed when muting became per-crew-only (NotifSheet, via
-- ChatInput → crew_notification_preferences). From that point on, this table had
-- no client write path — any row a user had set to false before the redesign left
-- them permanently muted across every crew, with no UI anywhere to undo it. A
-- prior hygiene pass (20260710000000_hygiene_drop_orphans.sql) flagged this table
-- as "missing-UI problem, NOT dead" and left it alone rather than resolve it.
--
-- FIX (paired with this same-day edge function change): send-notification no
-- longer reads notification_preferences at all — crew_notification_preferences
-- is the sole mute mechanism now. This migration resets every row back to the
-- opt-in default so no account is left stuck on the stale pre-redesign value;
-- since the column is no longer read, this is a one-time data cleanup rather
-- than something that needs to run again. The table/columns are kept, not
-- dropped, in case a global mute UI is ever reintroduced (see CLAUDE.md's
-- Gotchas entry on this).
-- =============================================================================

update public.notification_preferences
set notif_messages = true,
    notif_mentions = true,
    notif_replies  = true,
    updated_at     = now()
where notif_messages = false
   or notif_mentions = false
   or notif_replies  = false;
