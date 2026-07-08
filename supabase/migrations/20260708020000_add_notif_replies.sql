ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS notif_replies boolean NOT NULL DEFAULT true;

ALTER TABLE crew_notification_preferences
  ADD COLUMN IF NOT EXISTS notif_replies boolean NOT NULL DEFAULT true;
