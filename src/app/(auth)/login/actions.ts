'use server'

import { createClient, createServiceClient } from '@/shared/supabase/server'
import { validateUsernameFormat } from '@/shared/utils/username'
import type { AvatarClass } from '@/types'

export interface ReservedUserData {
  username: string
  class: string | null
}

export type CheckReservedResult =
  | { found: false; hasSession: boolean }
  | { found: true; hasSession: true; data: ReservedUserData }

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
  const { data } = await service
    .from('reserved_users')
    .select('username, class')
    .eq('email', session.user.email.toLowerCase())
    .maybeSingle()

  if (!data) return { found: false, hasSession: true }
  return {
    found: true,
    hasSession: true,
    data: {
      username: data.username,
      class: data.class,
    },
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

export async function completeInviteFlowAction(
  code: string,
  username: string,
  cls: string,
  firstName: string = '',
  lastName: string = '',
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
