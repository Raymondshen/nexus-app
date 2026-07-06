-- Announcement cards now always show a title, timestamp, body, and image (Figma 419:1930).
alter table announcements
  add column title text,
  add column image_url text;

-- Backfill any pre-existing rows so the NOT NULL below doesn't fail on replay
-- against non-empty data (see needs_username_reset for the same pattern).
update announcements
  set title     = coalesce(title, 'Announcement'),
      image_url = coalesce(image_url, '/img/announcements/chatroom-update-v1.svg')
  where title is null or image_url is null;

alter table announcements
  alter column title set not null,
  alter column image_url set not null,
  add constraint announcements_title_check check (char_length(title) between 1 and 200),
  add constraint announcements_image_url_check check (char_length(image_url) between 1 and 300);
