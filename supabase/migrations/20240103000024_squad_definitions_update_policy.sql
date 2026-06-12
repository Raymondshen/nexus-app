CREATE POLICY "squad_definitions: creator can update"
  ON squad_definitions FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);
