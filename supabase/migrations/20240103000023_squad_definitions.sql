CREATE TABLE IF NOT EXISTS squad_definitions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id     uuid        NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  creator_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word        text        NOT NULL CHECK (char_length(trim(word)) >= 1 AND char_length(word) <= 50),
  definition  text        NOT NULL CHECK (char_length(trim(definition)) >= 1 AND char_length(definition) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX squad_definitions_crew_word_uq
  ON squad_definitions (crew_id, lower(word));

ALTER TABLE squad_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "squad_definitions: crew members can read"
  ON squad_definitions FOR SELECT
  USING (is_crew_member(crew_id));

CREATE POLICY "squad_definitions: crew members can insert"
  ON squad_definitions FOR INSERT
  WITH CHECK (auth.uid() = creator_id AND is_crew_member(crew_id));

CREATE POLICY "squad_definitions: creator can delete"
  ON squad_definitions FOR DELETE
  USING (auth.uid() = creator_id);

ALTER PUBLICATION supabase_realtime ADD TABLE squad_definitions;
