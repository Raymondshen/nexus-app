-- definition_suggestions: pending suggested changes to squad definitions.
-- Creator reviews each suggestion and approves (overrides definition) or denies (deletes suggestion).

CREATE TABLE definition_suggestions (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  definition_id        uuid NOT NULL REFERENCES squad_definitions(id) ON DELETE CASCADE,
  crew_id              uuid NOT NULL,
  suggester_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggested_definition text NOT NULL CHECK (char_length(suggested_definition) BETWEEN 1 AND 500),
  created_at           timestamptz DEFAULT now() NOT NULL,
  UNIQUE (definition_id, suggester_id)
);

-- Full identity so DELETE payloads include all columns (needed for realtime crew_id/definition_id)
ALTER TABLE definition_suggestions REPLICA IDENTITY FULL;

ALTER TABLE definition_suggestions ENABLE ROW LEVEL SECURITY;

-- Any crew member can read suggestions in their crew (creator needs this to review)
CREATE POLICY "crew_members_select_suggestions" ON definition_suggestions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM crew_members
      WHERE crew_members.crew_id = definition_suggestions.crew_id
        AND crew_members.user_id = auth.uid()
    )
  );

-- Crew members can insert their own suggestions
CREATE POLICY "crew_members_insert_suggestions" ON definition_suggestions
  FOR INSERT WITH CHECK (
    suggester_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM crew_members cm
      WHERE cm.crew_id = definition_suggestions.crew_id
        AND cm.user_id = auth.uid()
    )
  );

-- Suggester can delete their own; definition creator can delete any suggestion for their definition
CREATE POLICY "delete_suggestions" ON definition_suggestions
  FOR DELETE USING (
    suggester_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM squad_definitions sd
      WHERE sd.id = definition_suggestions.definition_id
        AND sd.creator_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE definition_suggestions;
