-- Crew image: square photo per group chat
ALTER TABLE crews ADD COLUMN IF NOT EXISTS image_url          text;
ALTER TABLE crews ADD COLUMN IF NOT EXISTS image_storage_key  text;

-- crew-images storage bucket (public reads, authenticated writes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crew-images',
  'crew-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heic-sequence', 'image/heif']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "crew-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'crew-images');

CREATE POLICY "crew-images: authenticated upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'crew-images' AND auth.role() = 'authenticated');

CREATE POLICY "crew-images: authenticated delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'crew-images' AND auth.role() = 'authenticated');
