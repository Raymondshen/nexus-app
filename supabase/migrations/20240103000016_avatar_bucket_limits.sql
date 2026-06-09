-- Raise the avatars bucket size limit to 10 MB so iOS HEIC files can reach the
-- canvas before being rejected, and add HEIC/HEIF to the accepted MIME list.
-- The canvas crop still compresses the final upload to well under 300 KB.
UPDATE storage.buckets
SET
  file_size_limit    = 10485760,
  allowed_mime_types = ARRAY[
    'image/webp',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/heic',
    'image/heic-sequence',
    'image/heif'
  ]
WHERE id = 'avatars';
