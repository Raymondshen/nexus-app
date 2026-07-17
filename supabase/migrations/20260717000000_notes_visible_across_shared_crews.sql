-- Viewing another member's profile only showed the vibes they posted in the one
-- crew you're both currently viewing from — the SELECT policy checked membership
-- against notes.crew_id specifically, so vibes posted in any *other* crew the
-- member is also in silently disappeared for that viewer, even though the client
-- query (created_by = target user, no crew filter) fetches all of them. Own-profile
-- viewing was unaffected since `created_by = auth.uid()` always passes there.
--
-- A vibe should be visible to anyone who shares *any* crew with its creator, not
-- just the one it happened to be posted in — matching how the rest of a member's
-- profile (message counts, friendship XP, etc) is already global, not per-crew.

ALTER POLICY "crew members can view notes" ON public.notes
  USING (
    (created_by = (select auth.uid())) OR
    (EXISTS (
      SELECT 1 FROM crew_members viewer_cm
      JOIN crew_members creator_cm ON creator_cm.crew_id = viewer_cm.crew_id
      WHERE viewer_cm.user_id = (select auth.uid())
        AND creator_cm.user_id = notes.created_by
    ))
  );
