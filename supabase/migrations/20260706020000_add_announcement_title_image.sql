-- Announcement cards now always show a title, timestamp, body, and image (Figma 419:1930).
alter table announcements
  add column title text not null check (char_length(title) between 1 and 200),
  add column image_url text not null check (char_length(image_url) between 1 and 300);
