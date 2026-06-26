'use server'

import { revalidateTag } from 'next/cache'
import { createClient, createServiceClient } from '@/shared/supabase/server'

export async function revalidateProfileAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  revalidateTag(`profile:${user.id}`, 'max')
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const AVATAR_BUCKET      = 'avatars'
const BACKGROUND_BUCKET  = 'backgrounds'

function avatarPrefix() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/storage/v1/object/public/${AVATAR_BUCKET}/`
}

function backgroundPrefix() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/storage/v1/object/public/${BACKGROUND_BUCKET}/`
}

/** Derive {userId}/{ts} storage key from a full avatar CDN URL. */
function storageKeyFromUrl(url: string): string | null {
  const prefix = avatarPrefix()
  if (!url.startsWith(prefix)) return null
  const path = url.slice(prefix.length)
  // Strip size suffix: -{128|256|512}.ext  or  .ext  (legacy single-file)
  return path
    .replace(/-(128|256|512)\.(webp|jpg|png)$/, '')
    .replace(/\.(webp|jpg|png)$/, '')
}

/** Derive {userId}/{ts} storage key from a full background CDN URL. */
function backgroundKeyFromUrl(url: string): string | null {
  const prefix = backgroundPrefix()
  if (!url.startsWith(prefix)) return null
  return url.slice(prefix.length).replace(/\.(webp|jpg|png)$/, '')
}

/** Bulk-delete all storage variants for a given {userId}/{ts} key in a bucket. */
async function deleteStorageFiles(bucket: string, storageKey: string) {
  const slash    = storageKey.lastIndexOf('/')
  const folder   = storageKey.slice(0, slash)
  const tsPrefix = storageKey.slice(slash + 1)
  const service  = createServiceClient()
  const { data: files } = await service.storage
    .from(bucket)
    .list(folder, { search: tsPrefix })
  if (files && files.length > 0) {
    await service.storage
      .from(bucket)
      .remove(files.map((f) => `${folder}/${f.name}`))
  }
}

/** @deprecated Use deleteStorageFiles with explicit bucket */
async function deleteStorageVariants(storageKey: string) {
  return deleteStorageFiles(AVATAR_BUCKET, storageKey)
}

/** Invalidate profile + all crew-member caches for a user. */
async function revalidateUserCaches(userId: string, crewIds: string[]) {
  revalidateTag(`profile:${userId}`, 'max')
  for (const crewId of crewIds) {
    revalidateTag(`crew-members:${crewId}`, 'max')
  }
}

// ── Actions ────────────────────────────────────────────────────────────────────

export async function updateAvatarAction(newAvatarUrl: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const userId = user.id

  const storageKey = storageKeyFromUrl(newAvatarUrl)

  // Fetch old keys + crew membership list in parallel
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('avatar_url, avatar_storage_key').eq('id', userId).single(),
    supabase.from('crew_members').select('crew_id').eq('user_id', userId),
  ])
  type OldProfile = { avatar_url?: string | null; avatar_storage_key?: string | null }
  const oldUrl        = (profile as OldProfile | null)?.avatar_url ?? null
  const oldStorageKey = (profile as OldProfile | null)?.avatar_storage_key ?? null

  // Persist new URL, storage key, and mark as custom
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: newAvatarUrl, custom_avatar: true, avatar_storage_key: storageKey })
    .eq('id', userId)
  if (error) return { error: error.message }

  // Delete old storage variants
  if (oldStorageKey) {
    await deleteStorageVariants(oldStorageKey)
  } else if (oldUrl?.startsWith(avatarPrefix())) {
    // Legacy: single-file upload without a stored key
    const service = createServiceClient()
    await service.storage.from(AVATAR_BUCKET).remove([oldUrl.slice(avatarPrefix().length)])
  }

  // Fire-and-forget AVIF generation — non-blocking, failure is acceptable
  if (storageKey) {
    const slash  = storageKey.lastIndexOf('/')
    const ts     = storageKey.slice(slash + 1)
    const ext    = newAvatarUrl.match(/\.(webp|jpg|png)$/)?.[1] ?? 'webp'
    const fnUrl  = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-avatar`
    fetch(fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ts, ext }),
    }).catch(() => {})
  }

  const crewIds = ((memberships ?? []) as { crew_id: string }[]).map((r) => r.crew_id)
  await revalidateUserCaches(userId, crewIds)
  return { error: null }
}

export async function updateProfileDetailsAction(
  displayName: string,
  status: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const trimmedName   = displayName.trim()
  const trimmedStatus = status.trim().slice(0, 100)
  if (!trimmedName || trimmedName.length < 3) return { error: 'Name too short' }

  const { data: existing } = await supabase
    .from('profiles').select('id').ilike('username', trimmedName).neq('id', user.id).maybeSingle()
  if (existing) return { error: 'taken' }

  const { error } = await supabase
    .from('profiles')
    .update({ username: trimmedName, status: trimmedStatus || null })
    .eq('id', user.id)
  if (error) {
    if (error.code === '23505') return { error: 'taken' }
    return { error: error.message }
  }

  revalidateTag(`profile:${user.id}`, 'max')
  return { error: null }
}

export async function resetAvatarAction(): Promise<{ error: string | null; avatarUrl?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const userId = user.id

  // Google avatar URL lives in user_metadata (refreshed on every OAuth login)
  const googleAvatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null

  // Fetch current storage key + crew membership list in parallel
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('avatar_storage_key').eq('id', userId).single(),
    supabase.from('crew_members').select('crew_id').eq('user_id', userId),
  ])
  const oldStorageKey = (profile as { avatar_storage_key?: string | null } | null)?.avatar_storage_key ?? null

  // Reset profile to Google photo and clear custom flag
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: googleAvatarUrl, custom_avatar: false, avatar_storage_key: null })
    .eq('id', userId)
  if (error) return { error: error.message }

  // Bulk-delete all storage variants
  if (oldStorageKey) {
    await deleteStorageVariants(oldStorageKey)
  }

  const crewIds = ((memberships ?? []) as { crew_id: string }[]).map((r) => r.crew_id)
  await revalidateUserCaches(userId, crewIds)
  return { error: null, avatarUrl: googleAvatarUrl }
}

export async function updateBackgroundAction(newBackgroundUrl: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const userId = user.id

  const storageKey = backgroundKeyFromUrl(newBackgroundUrl)

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('background_url, background_storage_key').eq('id', userId).single(),
    supabase.from('crew_members').select('crew_id').eq('user_id', userId),
  ])
  type OldBg = { background_url?: string | null; background_storage_key?: string | null }
  const oldStorageKey = (profile as OldBg | null)?.background_storage_key ?? null
  const oldUrl        = (profile as OldBg | null)?.background_url ?? null

  const { error } = await supabase
    .from('profiles')
    .update({ background_url: newBackgroundUrl, background_storage_key: storageKey })
    .eq('id', userId)
  if (error) return { error: error.message }

  if (oldStorageKey) {
    await deleteStorageFiles(BACKGROUND_BUCKET, oldStorageKey)
  } else if (oldUrl?.startsWith(backgroundPrefix())) {
    const service = createServiceClient()
    await service.storage.from(BACKGROUND_BUCKET).remove([oldUrl.slice(backgroundPrefix().length)])
  }

  const crewIds = ((memberships ?? []) as { crew_id: string }[]).map((r) => r.crew_id)
  await revalidateUserCaches(userId, crewIds)
  return { error: null }
}

export async function requestAccountDeletionAction(): Promise<{ error: string | null; deleteAt?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (user.is_anonymous) return { error: 'Guest accounts cannot be deleted this way' }

  const deleteAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('pending_deletions')
    .upsert({ user_id: user.id, requested_at: new Date().toISOString(), delete_at: deleteAt }, { onConflict: 'user_id' })
  if (error) return { error: error.message }

  await supabase.auth.signOut()
  return { error: null, deleteAt }
}

export async function cancelAccountDeletionAction(): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('pending_deletions')
    .delete()
    .eq('user_id', user.id)
  if (error) return { error: error.message }
  return { error: null }
}

export async function resetBackgroundAction(): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const userId = user.id

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('background_storage_key').eq('id', userId).single(),
    supabase.from('crew_members').select('crew_id').eq('user_id', userId),
  ])
  const oldStorageKey = (profile as { background_storage_key?: string | null } | null)?.background_storage_key ?? null

  const { error } = await supabase
    .from('profiles')
    .update({ background_url: null, background_storage_key: null })
    .eq('id', userId)
  if (error) return { error: error.message }

  if (oldStorageKey) {
    await deleteStorageFiles(BACKGROUND_BUCKET, oldStorageKey)
  }

  const crewIds = ((memberships ?? []) as { crew_id: string }[]).map((r) => r.crew_id)
  await revalidateUserCaches(userId, crewIds)
  return { error: null }
}
