-- Add avatar_storage_key to track {userId}/{timestamp} prefix for bulk variant cleanup.
-- When a user uploads an avatar we now store 128px + 256px WebP variants;
-- having the key lets updateAvatarAction list-and-delete all of them in one pass.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_storage_key text;

-- Backfill existing multi-variant uploads: strip the -256.{ext} size suffix.
-- URL pattern: …/storage/v1/object/public/avatars/{userId}/{ts}-256.{ext}
-- Target key:  {userId}/{ts}
UPDATE profiles
SET avatar_storage_key = regexp_replace(
  regexp_replace(avatar_url, '^.*/storage/v1/object/public/avatars/', ''),
  '-(128|256|512)\.(webp|jpg|png)$',
  ''
)
WHERE custom_avatar = true
  AND avatar_url ~ '/storage/v1/object/public/avatars/.+-(128|256|512)\.(webp|jpg|png)$';

-- Backfill old single-file uploads: strip .{ext} only.
-- URL pattern: …/storage/v1/object/public/avatars/{userId}/{ts}.{ext}
UPDATE profiles
SET avatar_storage_key = regexp_replace(
  regexp_replace(avatar_url, '^.*/storage/v1/object/public/avatars/', ''),
  '\.(webp|jpg|png)$',
  ''
)
WHERE custom_avatar = true
  AND avatar_storage_key IS NULL
  AND avatar_url ~ '/storage/v1/object/public/avatars/.+\.(webp|jpg|png)$';
