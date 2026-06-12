-- Add actual_word column to squad_definitions
-- Stores the plain-English expansion of the word/alias (e.g. "Good Game" for "GG")
ALTER TABLE squad_definitions
  ADD COLUMN IF NOT EXISTS actual_word text;
