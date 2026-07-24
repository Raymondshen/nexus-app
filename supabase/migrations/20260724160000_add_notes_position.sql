-- Drag-to-reorder support for a user's own vibes (VibesPlaylistSheet, Figma 690:16468).
-- `position` is scoped per-creator (not globally unique) — every query that orders a
-- single user's own notes sorts `position asc, created_at desc`, so:
--   - Backfilled existing notes keep today's newest-first order as their starting position
--     (the newest note per user gets position 1, the oldest gets the highest number).
--   - New notes default to position 0, which sorts before every backfilled note (>= 1) —
--     so newly-added vibes still show first without addNoteAction needing to compute
--     anything. Multiple never-reordered new notes tie at 0 and fall back to the
--     created_at desc tiebreaker, which is still newest-first among them.
--   - Once the owner drags to reorder, the whole list is renumbered 0..N-1 in one action
--     (reorderNotesAction) rather than fractional/between-neighbor math.
-- No new RLS policy needed — "note creators can update notes" (20240103000040) already
-- grants UPDATE on any column for created_by = auth.uid().

alter table public.notes add column position bigint not null default 0;

update public.notes n
set position = sub.rn
from (
  select id, row_number() over (partition by created_by order by created_at desc) as rn
  from public.notes
) sub
where n.id = sub.id;

create index notes_created_by_position_idx on public.notes (created_by, position, created_at desc);
