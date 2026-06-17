-- ─── events ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id         uuid        NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  title           text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description     text        CHECK (char_length(description) <= 500),
  location        text        CHECK (char_length(location) <= 200),
  event_date      timestamptz NOT NULL,
  cover_image_url text,
  created_by      uuid        NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_crew_date_idx ON events(crew_id, event_date);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events: crew members can read"
  ON events FOR SELECT
  USING (is_crew_member(crew_id));

CREATE POLICY "events: crew members can insert"
  ON events FOR INSERT
  WITH CHECK (created_by = auth.uid() AND is_crew_member(crew_id));

CREATE POLICY "events: creator can delete"
  ON events FOR DELETE
  USING (created_by = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE events;

-- ─── event_rsvps ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id   uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id),
  status     text        NOT NULL CHECK (status IN ('going', 'maybe', 'not_going')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps REPLICA IDENTITY FULL;

CREATE POLICY "event_rsvps: crew members can read"
  ON event_rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_id
        AND is_crew_member(events.crew_id)
    )
  );

CREATE POLICY "event_rsvps: users can upsert own rsvp"
  ON event_rsvps FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_id
        AND is_crew_member(events.crew_id)
    )
  );

CREATE POLICY "event_rsvps: users can update own rsvp"
  ON event_rsvps FOR UPDATE
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE event_rsvps;

-- ─── messages.event_id ───────────────────────────────────────────────────────

ALTER TABLE messages ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id);
