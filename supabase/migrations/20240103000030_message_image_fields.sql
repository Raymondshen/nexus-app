-- Add image storage URL and LQIP blur-hash columns to messages.
-- image_url   : public Supabase Storage URL for image-type messages
-- image_blur_hash : tiny base64 JPEG LQIP (≈20×20px) used for blur-up placeholder
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url        TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_blur_hash  TEXT;
