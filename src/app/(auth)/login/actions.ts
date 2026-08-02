'use server'

import { createClient, createServiceClient } from '@/shared/supabase/server'
import { validateUsernameFormat } from '@/shared/utils/username'
import { validateBirthday } from '@/shared/utils/birthday'
import { normalizeSocialUrl, validateSocialLinkFormat } from '@/shared/utils/socialLinks'
import { completeCrewJoin } from '@/shared/utils/joinCrew'
import type { AvatarClass } from '@/types'

// Current-session profile snapshot needed by the Create Profile screen: the
// upload modals' userId prop, the read-only Account email box, and the hero
// preview's live coin/gem values (msg count is always 0 at this onboarding
// point — no crew joined yet — so it isn't fetched here).
export interface SessionProfileSnapshot {
  userId:     string
  email:      string
  coins:      number
  gemBalance: number
  avatarUrl:  string | null
}

export type SignupSessionResult =
  | { hasSession: false }
  | ({ hasSession: true } & SessionProfileSnapshot)

export async function getSignupSessionAction(): Promise<SignupSessionResult> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.email) return { hasSession: false }

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('coins, gem_balance, avatar_url')
    .eq('id', session.user.id)
    .maybeSingle()

  type ProfileSnapshotRow = { coins?: number; gem_balance?: number; avatar_url?: string | null }
  const profileRow = profile as ProfileSnapshotRow | null

  return {
    hasSession: true,
    userId:     session.user.id,
    email:      session.user.email,
    coins:      profileRow?.coins ?? 0,
    gemBalance: profileRow?.gem_balance ?? 0,
    avatarUrl:  profileRow?.avatar_url ?? null,
  }
}

// The crew preview JoinGroupStep's "invite success" screen (Figma 784:5792)
// needs — enough for the reused SwipePreviewCard + the full-page background,
// nothing that requires membership (this is shown before the caller has
// joined, sometimes before they're even signed in at all).
export interface JoinableCrewPreview {
  id:                  string
  name:                string
  imageUrl:            string | null
  backgroundImageUrl:  string | null
  level:               number
  memberCount:         number
}

export type InviteCodeCheckResult =
  | { valid: false }
  // Whether the caller already has a Supabase session — JoinGroupStep uses
  // this to decide the found-crew screen's CTA: "Join Group" (joins directly,
  // via joinCrewSessionAction below) if true, "Continue with Google" if not.
  // The crew is NOT joined as part of this check either way — this is a pure
  // read, so re-checking a code (or the screen re-rendering) never has a side
  // effect.
  | { valid: true; alreadySignedIn: boolean; crew: JoinableCrewPreview }

// Invite-code check for JoinGroupStep (Figma 774:20922 "onboarding - invite
// invalid" / 784:5792 "onboarding - Invite Success") — reachable while logged
// out, so this can't go through the `join_crew` RPC (requires `auth.uid()`,
// and its EXECUTE grant is `authenticated`-only, see CLAUDE.md → Server
// Authority) even for a caller who does happen to have a session; it's done
// via the service client instead (bypasses RLS, no session needed either
// way). `is_dm = false` excludes DM channels — every crew row has an
// `invite_code` (DMs included), and a DM's code was never meant to be
// joinable/discoverable through this flow, so resolving one here would leak
// a private channel's name/background image as if it were a public group.
export async function checkInviteCodeAction(code: string): Promise<InviteCodeCheckResult> {
  const clean = code.trim().toUpperCase()
  if (clean.length !== 6) return { valid: false }

  const service = createServiceClient()
  const { data: crew } = await service
    .from('crews')
    .select('id, name, image_url, background_image_url, level')
    .eq('invite_code', clean)
    .eq('is_dm', false)
    .maybeSingle()

  type CrewLookupRow = { id: string; name: string; image_url: string | null; background_image_url: string | null; level: number }
  const crewRow = crew as CrewLookupRow | null
  if (!crewRow) return { valid: false }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const { count } = await service
    .from('crew_members')
    .select('id', { count: 'exact', head: true })
    .eq('crew_id', crewRow.id)

  return {
    valid: true,
    alreadySignedIn: !!session,
    crew: {
      id:                 crewRow.id,
      name:               crewRow.name,
      imageUrl:           crewRow.image_url,
      backgroundImageUrl: crewRow.background_image_url,
      level:              crewRow.level,
      memberCount:        count ?? 0,
    },
  }
}

// Performs the actual join for an already-signed-in caller — JoinGroupStep's
// "Join Group" CTA on the found-crew screen when checkInviteCodeAction came
// back `alreadySignedIn: true` (so "Continue with Google" was never shown),
// and CreateProfileStep's post-signup resume of a pending invite for a
// brand-new account (see that file's own comment). Requires a session; a
// caller that might not have one yet should go through the
// Continue-with-Google → /auth/callback path instead, which has its own
// direct RPC call on the just-established session (see that route's comment
// for why it doesn't call this action instead).
export async function joinCrewSessionAction(code: string): Promise<{ crewId: string } | { error: string }> {
  const clean = code.trim().toUpperCase()
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const { data: crewId, error } = await supabase.rpc('join_crew', { p_invite_code: clean })
  if (error || !crewId) {
    return { error: error?.message ?? 'Could not join crew.' }
  }
  const id = crewId as string
  await completeCrewJoin(supabase, session.user.id, id)
  return { crewId: id }
}

export interface CompleteSignupExtra {
  status?:         string
  birthday?:       string
  instagramUrl?:   string
  xUrl?:           string
  redditUrl?:      string
  linkedinUrl?:    string
  customSiteUrl?:  string
}

export async function completeSignupAction(
  username: string,
  cls: string,
  firstName: string = '',
  lastName: string = '',
  extra: CompleteSignupExtra = {},
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Session expired. Please sign in again.' }

  const usernameClean  = username.trim().replace(/<[^>]*>/g, '').slice(0, 20)
  const firstNameClean = firstName.trim().replace(/<[^>]*>/g, '').slice(0, 50)
  const lastNameClean  = lastName.trim().replace(/<[^>]*>/g, '').slice(0, 50)

  const usernameError = validateUsernameFormat(usernameClean)
  if (usernameError) {
    return { success: false, error: usernameError }
  }

  if (!cls) {
    return { success: false, error: 'Select your class before entering.' }
  }

  // Setup Profile's Birthday field (Figma 774:20657) is required — validated
  // the same way onboarding/birthday/actions.ts already does (real calendar
  // date, not today/future, see shared/utils/birthday.ts), since both write
  // the same `profiles.birthday` column.
  if (!extra.birthday) {
    return { success: false, error: 'Birthday is required.' }
  }
  const birthdayError = validateBirthday(extra.birthday)
  if (birthdayError) {
    return { success: false, error: birthdayError }
  }

  const socialLinkError =
    validateSocialLinkFormat('instagram', extra.instagramUrl ?? '') ??
    validateSocialLinkFormat('x',         extra.xUrl ?? '') ??
    validateSocialLinkFormat('reddit',    extra.redditUrl ?? '') ??
    validateSocialLinkFormat('linkedin',  extra.linkedinUrl ?? '')
  if (socialLinkError) {
    return { success: false, error: socialLinkError }
  }

  const service = createServiceClient()

  const { data: existingUsername } = await service
    .from('profiles')
    .select('id')
    .ilike('username', usernameClean)
    .neq('id', session.user.id)
    .maybeSingle()

  if (existingUsername) {
    return { success: false, error: 'That warrior name is already taken. Choose another.' }
  }

  const profileUpdate: Record<string, unknown> = { username: usernameClean, avatar_class: cls as AvatarClass }
  if (firstNameClean) profileUpdate.first_name = firstNameClean
  if (lastNameClean)  profileUpdate.last_name  = lastNameClean
  if (extra.status !== undefined) profileUpdate.status = extra.status.trim().slice(0, 100) || null
  profileUpdate.birthday = extra.birthday
  profileUpdate.instagram_url   = normalizeSocialUrl(extra.instagramUrl ?? '')
  profileUpdate.x_url           = normalizeSocialUrl(extra.xUrl ?? '')
  profileUpdate.reddit_url      = normalizeSocialUrl(extra.redditUrl ?? '')
  profileUpdate.linkedin_url    = normalizeSocialUrl(extra.linkedinUrl ?? '')
  profileUpdate.custom_site_url = normalizeSocialUrl(extra.customSiteUrl ?? '')

  const { error: profileError } = await service
    .from('profiles')
    .update(profileUpdate)
    .eq('id', session.user.id)

  if (profileError) {
    return { success: false, error: 'The rift destabilized. Try again.' }
  }

  return { success: true }
}
