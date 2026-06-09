-- Safari/iOS canvas.toBlob falls back to image/png when WebP is unsupported.
-- Expand allowed MIME types so uploads succeed on all browsers.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/webp', 'image/png', 'image/jpeg']
WHERE id = 'avatars';
