'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import type { Database } from '@/types'

// No ambiguous chars: no 0, O, I, 1
const APP_INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateInviteCode(): string {
  return Array.from(
    { length: 6 },
    () => APP_INVITE_CHARS[Math.floor(Math.random() * APP_INVITE_CHARS.length)],
  ).join('')
}

export async function generateAppInviteAction(): Promise<
  { code: string; existing: boolean } | { error: string }
> {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  // Return existing unused code without deducting coins
  const { data: existingRow } = await service
    .from('app_invites')
    .select('code')
    .eq('inviter_id', user.id)
    .eq('used', false)
    .maybeSingle()

  if (existingRow) return { code: existingRow.code, existing: true }

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
      supabase.rpc('increment_user_coins', { p_user_id: user.id, p_amount: -25 }).then(r => r.error),
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
    return { code, existing: false }
  }

  return { error: 'Could not generate a unique code. Try again.' }
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
