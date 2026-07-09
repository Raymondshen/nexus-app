'use server'

import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSupabaseClient, createServiceClient } from '@/shared/supabase/server'
import type { Database, AppInvite, Announcement } from '@/types'
import type { AnnouncementItem } from '@/shared/components/banners/AnnouncementsSheet'

export interface InviteCodeData {
  id:                  string
  code:                string
  used:                boolean
  created_at:          string
  used_by_username:    string | null
  used_by_avatar_url:  string | null
}

// No ambiguous chars: no 0, O, I, 1
const APP_INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateInviteCode(): string {
  return Array.from(
    { length: 6 },
    () => APP_INVITE_CHARS[Math.floor(Math.random() * APP_INVITE_CHARS.length)],
  ).join('')
}

export async function generateAppInviteAction(): Promise<
  { code: string } | { error: string }
> {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  // Re-validate coin balance server-side before deducting (never trust client)
  const { data: profile } = await supabase
    .from('profiles')
    .select('coins')
    .eq('id', user.id)
    .single()

  if ((profile?.coins ?? 0) < 25) {
    return { error: 'Not enough coins. You need 25 coins to send an invite.' }
  }

  // Retry up to 10 times on code collision
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateInviteCode()

    const { data: collision } = await service
      .from('app_invites')
      .select('id')
      .eq('code', code)
      .maybeSingle()

    if (collision) continue

    const [insertErr, coinErr] = await Promise.all([
      service.from('app_invites').insert({ code, inviter_id: user.id }).then(r => r.error),
      // Service client (not the user's session): client EXECUTE on
      // increment_user_coins is revoked — a direct RPC with an arbitrary
      // p_amount would otherwise let any user mint coins for themselves.
      service.rpc('increment_user_coins', { p_user_id: user.id, p_amount: -25 }).then(r => r.error),
    ])

    if (insertErr) continue // race collision, retry

    if (coinErr) {
      // Roll back the insert
      await service.from('app_invites').delete().eq('code', code)
      return { error: 'Failed to deduct coins. Try again.' }
    }

    await service.from('coin_log').insert({
      user_id: user.id,
      crew_id: null,
      coins:   -25,
      source:  'invite_generated',
    })

    revalidateTag(`profile:${user.id}`, 'max')
    return { code }
  }

  return { error: 'Could not generate a unique code. Try again.' }
}

export async function getInviteCodesAction(): Promise<
  { codes: InviteCodeData[] } | { error: string }
> {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  const { data: rows, error } = await service
    .from('app_invites')
    .select('id, code, used, created_at, used_by')
    .eq('inviter_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }

  const inviteRows = (rows ?? []) as AppInvite[]

  const usedByIds = inviteRows
    .map(r => r.used_by)
    .filter((id): id is string => id !== null)

  const usernameMap:  Record<string, string> = {}
  const avatarUrlMap: Record<string, string> = {}
  if (usedByIds.length > 0) {
    const { data: profiles } = await service
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', usedByIds)
    for (const p of (profiles ?? [])) {
      usernameMap[p.id as string]  = p.username as string
      if (p.avatar_url) avatarUrlMap[p.id as string] = p.avatar_url as string
    }
  }

  return {
    codes: inviteRows.map(r => ({
      id:                 r.id,
      code:               r.code,
      used:               r.used,
      created_at:         r.created_at,
      used_by_username:   r.used_by ? (usernameMap[r.used_by] ?? null) : null,
      used_by_avatar_url: r.used_by ? (avatarUrlMap[r.used_by] ?? null) : null,
    })),
  }
}

// ─── Announcements ───────────────────────────────────────────────────────────

async function requireDev(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const service = createServiceClient()
  const { data } = await service.from('profiles').select('is_dev').eq('id', user.id).single()
  if (!(data as { is_dev?: boolean })?.is_dev) return { error: 'Not authorized' }
  return { userId: user.id }
}

// Cached: active announcements (invalidated by revalidateTag('announcements')).
// Sole place that encodes "what's currently live" — used by the home page.
function getCachedActiveAnnouncements() {
  return unstable_cache(
    async () => {
      const { data } = await createServiceClient()
        .from('announcements')
        .select('id, title, text, image_url, created_at')
        .eq('active', true)
        .order('created_at', { ascending: false })
      return (data ?? []) as AnnouncementItem[]
    },
    ['announcements'],
    { tags: ['announcements'], revalidate: 300 }
  )()
}

export async function getActiveAnnouncementsAction(): Promise<{ data: AnnouncementItem[] }> {
  return { data: await getCachedActiveAnnouncements() }
}

export async function getAllAnnouncementsAction(): Promise<{ data?: Announcement[]; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return auth
  const { data, error } = await createServiceClient()
    .from('announcements')
    .select('id, title, text, image_url, active, created_at')
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }
  return { data: (data ?? []) as Announcement[] }
}

export async function createAnnouncementAction(title: string, text: string, imageUrl: string): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return auth
  const trimmedTitle = title.trim()
  const trimmedText  = text.trim()
  const trimmedImage = imageUrl.trim()
  if (!trimmedTitle) return { error: 'Title is required' }
  if (!trimmedText)  return { error: 'Text is required' }
  if (!trimmedImage) return { error: 'Image URL is required' }
  const { error } = await createServiceClient().from('announcements').insert({ title: trimmedTitle, text: trimmedText, image_url: trimmedImage })
  if (error) return { error: error.message }
  revalidateTag('announcements', 'max')
  return { ok: true }
}

export async function updateAnnouncementAction(id: string, title: string, text: string, imageUrl: string): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return auth
  const trimmedTitle = title.trim()
  const trimmedText  = text.trim()
  const trimmedImage = imageUrl.trim()
  if (!trimmedTitle) return { error: 'Title is required' }
  if (!trimmedText)  return { error: 'Text is required' }
  if (!trimmedImage) return { error: 'Image URL is required' }
  const { error } = await createServiceClient().from('announcements').update({ title: trimmedTitle, text: trimmedText, image_url: trimmedImage }).eq('id', id)
  if (error) return { error: error.message }
  revalidateTag('announcements', 'max')
  return { ok: true }
}

export async function toggleAnnouncementAction(id: string, active: boolean): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return auth
  const { error } = await createServiceClient().from('announcements').update({ active }).eq('id', id)
  if (error) return { error: error.message }
  revalidateTag('announcements', 'max')
  return { ok: true }
}

export async function deleteAnnouncementAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return auth
  const { error } = await createServiceClient().from('announcements').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateTag('announcements', 'max')
  return { ok: true }
}

// Crew invite code alphabet (same as app_invites, no ambiguous chars)
const CREW_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genCrewCode() {
  return Array.from({ length: 6 }, () => CREW_CODE_CHARS[Math.floor(Math.random() * CREW_CODE_CHARS.length)]).join('')
}

export async function createCrewFromHomeAction(
  name: string,
): Promise<{ crewId: string } | { error: string }> {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const cleaned = name.trim().replace(/<[^>]*>/g, '').slice(0, 30)
  if (cleaned.length < 2) return { error: 'Squad name must be at least 2 characters.' }

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: crewId, error } = await supabase.rpc('create_crew', {
      p_name:        cleaned,
      p_invite_code: genCrewCode(),
    })
    if (!error && crewId) {
      revalidatePath('/home')
      return { crewId: crewId as string }
    }
    if (error && !error.message.includes('unique')) return { error: error.message }
  }
  return { error: 'Could not generate a unique invite code. Try again.' }
}

export async function joinCrewFromHomeAction(
  inviteCode: string,
): Promise<{
  crewId:                 string
  crewName:               string
  crewImageUrl:           string | null
  crewBackgroundImageUrl: string | null
  memberCount:            number
} | { error: string }> {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const code = inviteCode.trim().toUpperCase()
  if (code.length !== 6) return { error: 'Enter the full 6-character code.' }

  const { data: crewId, error } = await supabase.rpc('join_crew', { p_invite_code: code })

  if (error || !crewId) {
    const msg = error?.message ?? ''
    if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('does not exist')) {
      return { error: 'No crew found with that code.' }
    }
    return { error: msg || 'Could not join crew.' }
  }

  const id = crewId as string

  const [{ data: profile }, { data: crewRow }, { count }] = await Promise.all([
    supabase.from('profiles').select('username').eq('id', user.id).single(),
    supabase.from('crews').select('name, image_url, background_image_url').eq('id', id).single(),
    supabase.from('crew_members').select('id', { count: 'exact', head: true }).eq('crew_id', id),
  ])

  await supabase.from('messages').insert({
    crew_id:      id,
    user_id:      user.id,
    content:      `JOIN:${(profile as { username?: string } | null)?.username ?? 'warrior'}`,
    message_type: 'system',
    element_type: null,
    xp_awarded:   0,
  })

  const crew = crewRow as { name?: string; image_url?: string | null; background_image_url?: string | null } | null

  revalidatePath('/home')
  revalidateTag(`crew-members:${id}`, 'max')
  return {
    crewId:                 id,
    crewName:               crew?.name ?? '',
    crewImageUrl:           crew?.image_url ?? null,
    crewBackgroundImageUrl: crew?.background_image_url ?? null,
    memberCount:            count ?? 1,
  }
}

export async function joinSelectClassAction(
  crewId: string,
  cls:    string,
): Promise<{ ok: true } | { error: string }> {
  const validClasses = ['warrior', 'healer', 'archer', 'rogue', 'mage']
  if (!validClasses.includes(cls)) return { error: 'Invalid class.' }

  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('crew_members')
    .update({ class: cls })
    .eq('crew_id', crewId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidateTag(`crew-members:${crewId}`, 'max')
  revalidatePath('/home')
  return { ok: true }
}

export async function leaveCrewAction(
  crewId: string,
  token:  string,
): Promise<{ error?: string; deleted?: boolean }> {
  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return { error: 'Missing Supabase config' }

  // Use the user's JWT in the Authorization header so the SECURITY DEFINER
  // function runs with auth.uid() set correctly — no service role key needed.
  const supabase = createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabase.rpc('leave_crew', { p_crew_id: crewId })

  if (error) return { error: error.message }

  revalidatePath('/home')
  revalidateTag(`crew-members:${crewId}`, 'max')
  const result = (data ?? {}) as { deleted?: boolean; ok?: boolean }
  return result.deleted ? { deleted: true } : {}
}
