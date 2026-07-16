-- Create Profile screen (Figma 547:2289) adds a "Social Links" section —
-- optional public links a user can attach to their profile, surfaced on the
-- profile display pages and editable later from Manage Profile.
alter table profiles
  add column if not exists instagram_url   text,
  add column if not exists x_url           text,
  add column if not exists reddit_url      text,
  add column if not exists linkedin_url    text,
  add column if not exists custom_site_url text,
  add constraint profiles_instagram_url_check   check (instagram_url   is null or char_length(instagram_url)   <= 200),
  add constraint profiles_x_url_check           check (x_url           is null or char_length(x_url)           <= 200),
  add constraint profiles_reddit_url_check      check (reddit_url      is null or char_length(reddit_url)      <= 200),
  add constraint profiles_linkedin_url_check    check (linkedin_url    is null or char_length(linkedin_url)    <= 200),
  add constraint profiles_custom_site_url_check check (custom_site_url is null or char_length(custom_site_url) <= 200);
