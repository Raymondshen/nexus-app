-- Performance: wrap auth.uid() calls in RLS policies (and is_crew_member()) with
-- `(select auth.uid())` so Postgres evaluates the auth check once per statement
-- (an initplan) instead of once per row. Flagged by Supabase's performance
-- advisor ("Auth RLS Initialization Plan") across every policy below.
-- Semantics are unchanged — same predicate, same access — this only affects
-- how many times it's evaluated per query.
--
-- is_crew_member() alone gates nearly every crew-scoped SELECT in the app
-- (messages, crews, artifacts, crew_xp_log, active_raids, events, polls,
-- revive_tokens, squad_definitions), so fixing it improves those reads even
-- though those policies aren't individually listed below.

CREATE OR REPLACE FUNCTION public.is_crew_member(p_crew_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1 from crew_members
    where crew_id = p_crew_id
      and user_id = (select auth.uid())
  );
$function$;

-- app_invites
ALTER POLICY "app_invites: inviter inserts" ON public.app_invites
  WITH CHECK ((select auth.uid()) = inviter_id);
ALTER POLICY "app_invites: inviter reads own" ON public.app_invites
  USING ((select auth.uid()) = inviter_id);

-- board_sections
ALTER POLICY "creators can delete sections" ON public.board_sections
  USING (created_by = (select auth.uid()));
ALTER POLICY "crew members can create sections" ON public.board_sections
  WITH CHECK (
    (created_by = (select auth.uid())) AND
    (EXISTS (SELECT 1 FROM crew_members cm
             WHERE cm.crew_id = board_sections.crew_id
               AND cm.user_id = (select auth.uid())))
  );
ALTER POLICY "crew members can view sections" ON public.board_sections
  USING (
    EXISTS (SELECT 1 FROM crew_members cm
            WHERE cm.crew_id = board_sections.crew_id
              AND cm.user_id = (select auth.uid()))
  );

-- client_errors
ALTER POLICY "users_insert_own_errors" ON public.client_errors
  WITH CHECK ((select auth.uid()) = user_id);

-- crew_combat_members
ALTER POLICY "crew_combat_members: crew members can read" ON public.crew_combat_members
  USING (
    EXISTS (SELECT 1 FROM active_raids ar JOIN crew_members cm ON cm.crew_id = ar.crew_id
            WHERE ar.id = crew_combat_members.raid_id
              AND cm.user_id = (select auth.uid()))
  );

-- crew_members
ALTER POLICY "crew_members: users can join a crew" ON public.crew_members
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "crew_members: users can update own row" ON public.crew_members
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- crew_notification_mutes
ALTER POLICY "Users manage own crew notification mutes" ON public.crew_notification_mutes
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- crew_notification_preferences
ALTER POLICY "crew_notif_prefs: users manage own" ON public.crew_notification_preferences
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- crews
ALTER POLICY "crews: authenticated users can insert" ON public.crews
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- definition_suggestions
ALTER POLICY "crew_members_insert_suggestions" ON public.definition_suggestions
  WITH CHECK (
    (suggester_id = (select auth.uid())) AND
    (EXISTS (SELECT 1 FROM crew_members cm
             WHERE cm.crew_id = definition_suggestions.crew_id
               AND cm.user_id = (select auth.uid())))
  );
ALTER POLICY "crew_members_select_suggestions" ON public.definition_suggestions
  USING (
    EXISTS (SELECT 1 FROM crew_members
            WHERE crew_members.crew_id = definition_suggestions.crew_id
              AND crew_members.user_id = (select auth.uid()))
  );
ALTER POLICY "delete_suggestions" ON public.definition_suggestions
  USING (
    (suggester_id = (select auth.uid())) OR
    (EXISTS (SELECT 1 FROM squad_definitions sd
             WHERE sd.id = definition_suggestions.definition_id
               AND sd.creator_id = (select auth.uid())))
  );

-- event_rsvps
ALTER POLICY "event_rsvps: users can update own rsvp" ON public.event_rsvps
  USING (user_id = (select auth.uid()));
ALTER POLICY "event_rsvps: users can upsert own rsvp" ON public.event_rsvps
  WITH CHECK (
    (user_id = (select auth.uid())) AND
    (EXISTS (SELECT 1 FROM events
             WHERE events.id = event_rsvps.event_id
               AND is_crew_member(events.crew_id)))
  );

-- events
ALTER POLICY "events: creator can delete" ON public.events
  USING (created_by = (select auth.uid()));
ALTER POLICY "events: crew members can insert" ON public.events
  WITH CHECK ((created_by = (select auth.uid())) AND is_crew_member(crew_id));

-- friendship_xp
ALTER POLICY "friendship_xp: users see own pair" ON public.friendship_xp
  USING (((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b));

-- friendship_xp_log
ALTER POLICY "friendship_xp_log: users see own pair" ON public.friendship_xp_log
  USING (((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b));

-- friendships
ALTER POLICY "friendships: addressee can accept" ON public.friendships
  USING ((select auth.uid()) = addressee_id)
  WITH CHECK ((select auth.uid()) = addressee_id);
ALTER POLICY "friendships: either party can delete" ON public.friendships
  USING (((select auth.uid()) = requester_id) OR ((select auth.uid()) = addressee_id));
ALTER POLICY "friendships: users can send requests" ON public.friendships
  WITH CHECK ((select auth.uid()) = requester_id);
ALTER POLICY "friendships: users see own" ON public.friendships
  USING (((select auth.uid()) = requester_id) OR ((select auth.uid()) = addressee_id));

-- messages
ALTER POLICY "messages: crew members can insert" ON public.messages
  WITH CHECK ((user_id = (select auth.uid())) AND is_crew_member(crew_id));
ALTER POLICY "messages: users can update own image fields" ON public.messages
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- notes
ALTER POLICY "creators can delete own notes" ON public.notes
  USING (created_by = (select auth.uid()));
ALTER POLICY "crew members can insert notes" ON public.notes
  WITH CHECK (
    (created_by = (select auth.uid())) AND
    (EXISTS (SELECT 1 FROM crew_members cm
             WHERE cm.crew_id = notes.crew_id
               AND cm.user_id = (select auth.uid())))
  );
ALTER POLICY "crew members can view notes" ON public.notes
  USING (
    (created_by = (select auth.uid())) OR
    (EXISTS (SELECT 1 FROM crew_members cm
             WHERE cm.crew_id = notes.crew_id
               AND cm.user_id = (select auth.uid())))
  );
ALTER POLICY "note creators can update notes" ON public.notes
  USING (created_by = (select auth.uid()))
  WITH CHECK (created_by = (select auth.uid()));

-- notification_preferences
ALTER POLICY "Users manage own notification preferences" ON public.notification_preferences
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- pending_deletions
ALTER POLICY "own_pending_deletion_delete" ON public.pending_deletions
  USING ((select auth.uid()) = user_id);
ALTER POLICY "own_pending_deletion_insert" ON public.pending_deletions
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "own_pending_deletion_select" ON public.pending_deletions
  USING ((select auth.uid()) = user_id);

-- profile_photos
ALTER POLICY "profile_photos_owner_delete" ON public.profile_photos
  USING ((select auth.uid()) = user_id);
ALTER POLICY "profile_photos_owner_insert" ON public.profile_photos
  WITH CHECK ((select auth.uid()) = user_id);

-- profiles
ALTER POLICY "profiles: owner can update" ON public.profiles
  USING (id = (select auth.uid()));

-- push_subscriptions
ALTER POLICY "users can delete own subscriptions" ON public.push_subscriptions
  USING ((select auth.uid()) = user_id);
ALTER POLICY "users can insert own subscriptions" ON public.push_subscriptions
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "users can select own subscriptions" ON public.push_subscriptions
  USING ((select auth.uid()) = user_id);
ALTER POLICY "users can update own subscriptions" ON public.push_subscriptions
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- squad_definitions
ALTER POLICY "squad_definitions: creator can delete" ON public.squad_definitions
  USING ((select auth.uid()) = creator_id);
ALTER POLICY "squad_definitions: creator can update" ON public.squad_definitions
  USING ((select auth.uid()) = creator_id)
  WITH CHECK ((select auth.uid()) = creator_id);
ALTER POLICY "squad_definitions: crew members can insert" ON public.squad_definitions
  WITH CHECK (((select auth.uid()) = creator_id) AND is_crew_member(crew_id));

-- username_history
ALTER POLICY "username_history_insert_self" ON public.username_history
  WITH CHECK (user_id = (select auth.uid()));

-- coin_log
ALTER POLICY "coin_log: users see own" ON public.coin_log
  USING ((select auth.uid()) = user_id);
