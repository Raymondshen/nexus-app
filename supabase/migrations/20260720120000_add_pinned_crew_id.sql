-- Pin Squad feature: lets a user pin one of their own squads. The pinned squad is
-- surfaced first (after "Create Squad") in ChatRoomBrowseSheet's row, and preferred
-- by HomeClient's launch-redirect effect. A single nullable column gives "only one
-- pin at a time" and "pinning a new one unpins the old" for free — the app just
-- overwrites the value, no extra bookkeeping needed.
--
-- ON DELETE SET NULL: if the pinned crew is ever hard-deleted (last member leaving
-- a squad deletes the crew row, see leave_crew), the pin clears automatically
-- instead of leaving a dangling reference. A stale pin left behind by simply
-- leaving a still-alive crew is harmless — every consumer (ChatRoomBrowseSheet's
-- reordering, HomeClient's launch-redirect) only acts on it when it matches a crew
-- the user is still a member of.
alter table profiles
  add column pinned_crew_id uuid references crews(id) on delete set null;
