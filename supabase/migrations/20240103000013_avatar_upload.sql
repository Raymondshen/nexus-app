-- Add custom_avatar flag: when true, the Google OAuth sync skips overwriting avatar_url
-- so that user-uploaded photos survive re-login.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_avatar boolean NOT NULL DEFAULT false;

-- Public avatars bucket (300 KB max, WebP only, CDN-cached via cache-control header)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  307200,
  ARRAY['image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Each user may only write inside their own folder ({userId}/*)
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
