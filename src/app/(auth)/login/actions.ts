'use server'

import { createClient, createServiceClient } from '@/shared/supabase/server'
import { validateUsernameFormat } from '@/shared/utils/username'
import { normalizeSocialUrl } from '@/shared/utils/socialLinks'
import type { AvatarClass } from '@/types'

export interface ReservedUserData {
  username: string
  class: string | null
}

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

export type CheckReservedResult =
  | { found: false; hasSession: false }
  | ({ found: false; hasSession: true } & SessionProfileSnapshot)
  | ({ found: true; hasSession: true; data: ReservedUserData } & SessionProfileSnapshot)

export async function validateInviteCodeAction(
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const codeClean = code.trim().toUpperCase()
  if (!codeClean) return { valid: false, error: 'Enter an invite code.' }

  const service = createServiceClient()
  const { data: inviteRow } = await service
    .from('app_invites')
    .select('id, used')
    .eq('code', codeClean)
    .maybeSingle()

  if (!inviteRow) return { valid: false, error: 'The Nexus does not recognize this code.' }
  if (inviteRow.used) return { valid: false, error: 'This code has already been claimed.' }
  return { valid: true }
}

export async function checkReservedUserAction(): Promise<CheckReservedResult> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.email) return { found: false, hasSession: false }

  const service = createServiceClient()
  const [{ data: reserved }, { data: profile }] = await Promise.all([
    service
      .from('reserved_users')
      .select('username, class')
      .eq('email', session.user.email.toLowerCase())
      .maybeSingle(),
    service
      .from('profiles')
      .select('coins, gem_balance, avatar_url')
      .eq('id', session.user.id)
      .maybeSingle(),
  ])

  type ProfileSnapshotRow = { coins?: number; gem_balance?: number; avatar_url?: string | null }
  const profileRow = profile as ProfileSnapshotRow | null
  const snapshot: SessionProfileSnapshot = {
    userId:     session.user.id,
    email:      session.user.email,
    coins:      profileRow?.coins ?? 0,
    gemBalance: profileRow?.gem_balance ?? 0,
    avatarUrl:  profileRow?.avatar_url ?? null,
  }

  if (!reserved) return { found: false, hasSession: true, ...snapshot }
  return {
    found: true,
    hasSession: true,
    data: {
      username: reserved.username,
      class: reserved.class,
    },
    ...snapshot,
  }
}

export async function reservePlaceAction(
  email: string,
  username: string,
  cls: string,
  firstName: string,
  lastName: string,
): Promise<{ success: boolean; error?: string }> {
  const emailClean = email.trim().toLowerCase()
  if (!emailClean.endsWith('@gmail.com')) {
    return { success: false, error: 'Gmail only. Your class and name will be held until your invite arrives.' }
  }

  const usernameClean  = username.trim().replace(/<[^>]*>/g, '').slice(0, 20)
  const firstNameClean = firstName.trim().replace(/<[^>]*>/g, '').slice(0, 50)
  const lastNameClean  = lastName.trim().replace(/<[^>]*>/g, '').slice(0, 50)

  const usernameError = validateUsernameFormat(usernameClean)
  if (usernameError) {
    return { success: false, error: usernameError }
  }
  if (!firstNameClean) {
    return { success: false, error: 'First name is required.' }
  }
  if (!lastNameClean) {
    return { success: false, error: 'Last name is required.' }
  }

  const service = createServiceClient()

  const { data: existing } = await service
    .from('reserved_users')
    .select('id')
    .eq('email', emailClean)
    .maybeSingle()

  if (existing) {
    return { success: false, error: 'A warrior already guards this name.' }
  }

  const { error } = await service
    .from('reserved_users')
    .insert({ email: emailClean, username: usernameClean, class: cls || null, first_name: firstNameClean, last_name: lastNameClean })

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A warrior already guards this name.' }
    }
    return { success: false, error: 'The rift destabilized. Try again.' }
  }

  return { success: true }
}

export interface CompleteInviteExtra {
  status?:         string
  instagramUrl?:   string
  xUrl?:           string
  redditUrl?:      string
  linkedinUrl?:    string
  customSiteUrl?:  string
}

export async function completeInviteFlowAction(
  code: string,
  username: string,
  cls: string,
  firstName: string = '',
  lastName: string = '',
  extra: CompleteInviteExtra = {},
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Session expired. Please sign in again.' }

  const codeClean      = code.trim().toUpperCase()
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

  // Look up invite code — distinguish invalid vs already-used
  const { data: inviteRow } = await service
    .from('app_invites')
    .select('id, used')
    .eq('code', codeClean)
    .maybeSingle()

  if (!inviteRow) {
    return { success: false, error: 'The Nexus does not recognize this code.' }
  }

  if (inviteRow.used) {
    return { success: false, error: 'This code has already been claimed.' }
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

  // Mark invite used — eq('used', false) guards against a race condition
  await service
    .from('app_invites')
    .update({ used: true, used_by: session.user.id, used_at: new Date().toISOString() })
    .eq('id', inviteRow.id)
    .eq('used', false)

  return { success: true }
}

/**
 * "Sign in with Google" (no invite code) landed on a Google account with no
 * Nexus profile yet (Figma 547:2452/2587 — the "no account exists" screen).
 * The user is already authenticated at this point (real session from
 * exchangeCodeForSession), unlike the pre-auth `reservePlaceAction` flow.
 * If an invite code is entered here, complete registration immediately via
 * the same path as the invite flow. Otherwise, just reserve the display name
 * against this account's email — `checkReservedUserAction`/
 * `completeInviteFlowAction` already auto-detect a matching `reserved_users`
 * row by email once a real invite arrives later, so this is a new entry
 * point into that same existing mechanism, not a separate one.
 */
export async function reserveAfterGoogleAction(
  displayName: string,
  inviteCode: string,
): Promise<{ success: boolean; reserved?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.email) return { success: false, error: 'Session expired. Please sign in again.' }

  const usernameClean = displayName.trim().replace(/<[^>]*>/g, '').slice(0, 20)
  const usernameError = validateUsernameFormat(usernameClean)
  if (usernameError) return { success: false, error: usernameError }

  const codeClean = inviteCode.trim().toUpperCase()
  if (codeClean) {
    return completeInviteFlowAction(codeClean, usernameClean, 'mage')
  }

  const service = createServiceClient()
  const { error } = await service
    .from('reserved_users')
    .upsert({ email: session.user.email.toLowerCase(), username: usernameClean }, { onConflict: 'email' })

  if (error) {
    if (error.code === '23505') return { success: false, error: 'A warrior already guards this name.' }
    return { success: false, error: 'The rift destabilized. Try again.' }
  }

  return { success: true, reserved: true }
}
