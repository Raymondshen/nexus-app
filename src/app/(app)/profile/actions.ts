'use server'

import { revalidateTag } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function revalidateProfileAction() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  revalidateTag(`profile:${session.user.id}`, 'max')
}

export async function updateAvatarAction(newAvatarUrl: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }
  const userId = session.user.id

  // Fetch old URL so we can clean up the previous file from storage
  const { data: profile } = await supabase
    .from('profiles').select('avatar_url').eq('id', userId).single()
  const oldUrl = (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null

  // Persist new URL and mark as custom so Google sync never overwrites it
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: newAvatarUrl, custom_avatar: true })
    .eq('id', userId)
  if (error) return { error: error.message }

  // Delete old file if it came from the avatars bucket
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const avatarPrefix = `${supabaseUrl}/storage/v1/object/public/avatars/`
  if (oldUrl?.startsWith(avatarPrefix)) {
    const oldPath = oldUrl.slice(avatarPrefix.length)
    const service = createServiceClient()
    await service.storage.from('avatars').remove([oldPath])
  }

  // Invalidate server caches for this user's profile + every crew they're in
  revalidateTag(`profile:${userId}`, 'max')
  const { data: memberships } = await supabase
    .from('crew_members').select('crew_id').eq('user_id', userId)
  if (memberships) {
    for (const row of memberships as { crew_id: string }[]) {
      revalidateTag(`crew-members:${row.crew_id}`, 'max')
    }
  }

  return { error: null }
}
