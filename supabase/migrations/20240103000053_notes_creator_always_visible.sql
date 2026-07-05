-- Vibes (notes) were disappearing from a member's own profile the instant they
-- left or were kicked from the crew the note was posted in — the old SELECT
-- policy required the VIEWER to be a *current* crew_members row, which also
-- blocked the creator from ever seeing their own note again. Vibes should be a
-- permanent part of a member's profile once added, independent of whether they
-- later leave that squad.
--
-- Current crew members keep read access to the crew's shared board; the
-- creator additionally always retains read access to their own notes.

drop policy if exists "crew members can view notes" on public.notes;

create policy "crew members can view notes"
  on public.notes for select
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.crew_members cm
      where cm.crew_id = notes.crew_id
        and cm.user_id = auth.uid()
    )
  );
