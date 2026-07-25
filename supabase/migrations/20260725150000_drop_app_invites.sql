-- Signup is now public (no invite code required). The app-level invite/
-- referral system (generate-for-25-coins, redeem-for-50-coins, the
-- recruit_arrived notification) has been removed from the app entirely —
-- see LoginForm.tsx / home/actions.ts / onboarding/welcome. This table has
-- no remaining readers or writers in the codebase.
--
-- Dropping the table also removes it from the supabase_realtime publication
-- automatically (InviteArsenal, the only realtime subscriber, was deleted
-- alongside this).
drop table if exists public.app_invites;
