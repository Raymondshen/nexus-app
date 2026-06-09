-- Fix chat-images INSERT policy: restrict uploads to the user's own folder.
-- Path structure is {crewId}/{userId}/{filename} — userId is the second segment.
-- The original policy had no path check, allowing any authenticated user to
-- write to any path (including overwriting another user's files).
DROP POLICY IF EXISTS "Authenticated users can upload chat images" ON storage.objects;

CREATE POLICY "Users can upload chat images to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND auth.uid()::text = (storage.foldername(name))[2]
);
