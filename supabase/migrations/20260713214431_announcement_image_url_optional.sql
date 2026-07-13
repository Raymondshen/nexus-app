-- Drafts (active = false) can now be saved without an image selected yet
-- (Figma 515:4664 "Save as draft" flow) — image_url becomes optional, but
-- still validated in length when present. Publishing (active = true) still
-- requires an image; that's enforced in createAnnouncementAction /
-- updateAnnouncementAction / toggleAnnouncementAction, not at the DB layer,
-- since a CHECK constraint can't see sibling-column state cheaply here.
alter table announcements
  alter column image_url drop not null,
  drop constraint announcements_image_url_check,
  add constraint announcements_image_url_check check (image_url is null or char_length(image_url) between 1 and 300);
