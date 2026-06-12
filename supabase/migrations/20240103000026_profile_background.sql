-- Add background image columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS background_url          text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS background_storage_key  text;

-- backgrounds storage bucket (public reads, per-user writes, 15 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'backgrounds',
  'backgrounds',
  true,
  15728640,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heic-sequence', 'image/heif']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "backgrounds: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'backgrounds');

CREATE POLICY "backgrounds: users upload own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "backgrounds: users delete own"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);
