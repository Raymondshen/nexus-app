'use server'

import { createClient, createServiceClient } from '@/shared/supabase/server'
import { validateUsernameFormat } from '@/shared/utils/username'
import { normalizeSocialUrl, validateSocialLinkFormat } from '@/shared/utils/socialLinks'
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

export interface CompleteSignupExtra {
  status?:         string
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
