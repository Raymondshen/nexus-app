-- Performance: add covering indexes for foreign keys flagged by the Supabase
-- performance advisor ("Unindexed foreign keys"). Without these, deleting/updating
-- the referenced row (e.g. a crew, a message, a profile) forces a sequential scan
-- of the referencing table to check for dependents, and any query that filters or
-- joins on these columns does the same.
--
-- Security hardening: pin search_path on every SECURITY DEFINER / trigger function
-- that didn't already set one ("Function Search Path Mutable" advisor). Without a
-- fixed search_path, a function's unqualified table references resolve against
-- whatever search_path is active in the calling session, which a malicious role
-- with schema-create privileges could otherwise influence. `public, pg_temp` keeps
-- every existing unqualified reference resolving exactly as before.

-- ── Foreign key indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS active_raids_boss_id             ON public.active_raids (boss_id);
CREATE INDEX IF NOT EXISTS active_raids_guard_user_id        ON public.active_raids (guard_user_id);
CREATE INDEX IF NOT EXISTS active_raids_mvp_user_id          ON public.active_raids (mvp_user_id);
CREATE INDEX IF NOT EXISTS app_invites_inviter_id            ON public.app_invites (inviter_id);
CREATE INDEX IF NOT EXISTS app_invites_used_by               ON public.app_invites (used_by);
CREATE INDEX IF NOT EXISTS artifact_templates_boss_id        ON public.artifact_templates (boss_id);
CREATE INDEX IF NOT EXISTS artifacts_mvp_user_id             ON public.artifacts (mvp_user_id);
CREATE INDEX IF NOT EXISTS artifacts_source_boss_id          ON public.artifacts (source_boss_id);
CREATE INDEX IF NOT EXISTS board_sections_created_by         ON public.board_sections (created_by);
CREATE INDEX IF NOT EXISTS client_errors_user_id             ON public.client_errors (user_id);
CREATE INDEX IF NOT EXISTS coin_log_crew_id                  ON public.coin_log (crew_id);
CREATE INDEX IF NOT EXISTS coin_log_user_id                  ON public.coin_log (user_id);
CREATE INDEX IF NOT EXISTS crew_notification_mutes_crew_id   ON public.crew_notification_mutes (crew_id);
CREATE INDEX IF NOT EXISTS crew_notification_preferences_crew_id ON public.crew_notification_preferences (crew_id);
CREATE INDEX IF NOT EXISTS crew_xp_log_crew_id               ON public.crew_xp_log (crew_id);
CREATE INDEX IF NOT EXISTS crew_xp_log_user_id                ON public.crew_xp_log (user_id);
CREATE INDEX IF NOT EXISTS crews_dm_partner_1                ON public.crews (dm_partner_1);
CREATE INDEX IF NOT EXISTS crews_dm_partner_2                ON public.crews (dm_partner_2);
CREATE INDEX IF NOT EXISTS crews_last_message_sender_id      ON public.crews (last_message_sender_id);
CREATE INDEX IF NOT EXISTS definition_suggestions_suggester_id ON public.definition_suggestions (suggester_id);
CREATE INDEX IF NOT EXISTS event_rsvps_user_id                ON public.event_rsvps (user_id);
CREATE INDEX IF NOT EXISTS events_created_by                  ON public.events (created_by);
CREATE INDEX IF NOT EXISTS friendship_xp_user_b                ON public.friendship_xp (user_b);
CREATE INDEX IF NOT EXISTS friendships_addressee_id            ON public.friendships (addressee_id);
CREATE INDEX IF NOT EXISTS messages_event_id                   ON public.messages (event_id);
CREATE INDEX IF NOT EXISTS messages_pinned_by                  ON public.messages (pinned_by);
CREATE INDEX IF NOT EXISTS messages_reply_to_id                ON public.messages (reply_to_id);
CREATE INDEX IF NOT EXISTS messages_user_id                    ON public.messages (user_id);
CREATE INDEX IF NOT EXISTS notes_created_by                    ON public.notes (created_by);
CREATE INDEX IF NOT EXISTS notes_section_id                    ON public.notes (section_id);
CREATE INDEX IF NOT EXISTS polls_creator_id                    ON public.polls (creator_id);
CREATE INDEX IF NOT EXISTS polls_crew_id                       ON public.polls (crew_id);
CREATE INDEX IF NOT EXISTS polls_message_id                    ON public.polls (message_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_crew_id          ON public.push_subscriptions (crew_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id          ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS squad_definitions_creator_id        ON public.squad_definitions (creator_id);

-- ── Fixed search_path on SECURITY DEFINER / trigger functions ──────────────────

ALTER FUNCTION public.apply_boss_damage(p_raid_id uuid, p_member_id uuid, p_final_dmg integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_join_active_raid() SET search_path = public, pg_temp;
ALTER FUNCTION public.claim_daily_gem(p_user_id uuid, p_local_midnight timestamp with time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.close_poll(p_poll_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_poll(p_crew_id uuid, p_question text, p_options jsonb, p_expires_at timestamp with time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.damage_raid(p_raid_id uuid, p_damage integer, p_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_crew_member_msg_counts(p_crew_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_member_crew_stats(p_crew_id uuid, p_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_or_create_dm(other_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_unread_counts(p_crew_ids uuid[], p_cutoffs timestamp with time zone[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_crew_xp(p_crew_id uuid, p_xp_delta integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_friendship_xp(p_user_a uuid, p_user_b uuid, p_amount integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_user_coins(p_user_id uuid, p_amount integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.init_combat_members(p_raid_id uuid, p_crew_id uuid, p_crew_level integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_crew_member(p_crew_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.messages_protect_pin_columns() SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_client_gem_writes() SET search_path = public, pg_temp;
ALTER FUNCTION public.toggle_reaction(p_message_id uuid, p_emoji text, p_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_active() SET search_path = public, pg_temp;
ALTER FUNCTION public.use_revive_token(p_raid_id uuid, p_target_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.vote_on_poll(p_poll_id uuid, p_option_index integer) SET search_path = public, pg_temp;
