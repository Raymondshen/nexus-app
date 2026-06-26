'use server'

import { redirect } from 'next/navigation'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient, createServiceClient } from '@/shared/supabase/server'

export async function joinCrewFromWelcomeAction(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const code       = (formData.get('crewCode') as string).trim().toUpperCase()
  const inviteCode = (formData.get('inviteCode') as string) || null

  if (code.length !== 6) return { error: 'Enter the full 6-character code.' }

  const { data: crewId, error } = await supabase.rpc('join_crew', { p_invite_code: code })

  if (error || !crewId) {
    if (error?.message.includes('Crew not found')) {
      return { error: 'No crew found. Check the code.' }
    }
    return { error: error?.message ?? 'Failed to join crew.' }
  }

  const service = createServiceClient()

  // Fetch user profile and invite row in parallel
  const [{ data: profile }, inviteResult] = await Promise.all([
    supabase.from('profiles').select('username').eq('id', user.id).single(),
    inviteCode
      ? service.from('app_invites').select('id, inviter_id, used').eq('code', inviteCode).eq('used', false).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const inviteRow = (inviteResult as { data: { id: string; inviter_id: string; used: boolean } | null }).data

  // Fetch inviter profile when we have a valid invite from someone else
  let inviterUsername: string | null = null
  if (inviteRow && inviteRow.inviter_id !== user.id) {
    const { data: inviterProfile } = await service
      .from('profiles')
      .select('username')
      .eq('id', inviteRow.inviter_id)
      .single()
    inviterUsername = inviterProfile?.username ?? null
  }

  // Insert JOIN system message — include inviter username when available
  const joinContent = inviterUsername
    ? `JOIN:${profile?.username ?? 'warrior'}:${inviterUsername}`
    : `JOIN:${profile?.username ?? 'warrior'}`

  await supabase.from('messages').insert({
    crew_id:      crewId,
    user_id:      user.id,
    content:      joinContent,
    message_type: 'system',
    element_type: null,
    xp_awarded:   0,
  })

  // Award seed coins + notify inviter (idempotent)
  if (inviteRow && inviteRow.inviter_id !== user.id) {
    const { data: alreadySeed } = await service
      .from('coin_log')
      .select('id')
      .eq('user_id', user.id)
      .eq('source', 'seed')
      .maybeSingle()

    if (!alreadySeed) {
      const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`

      await Promise.all([
        service
          .from('app_invites')
          .update({ used: true, used_by: user.id, used_at: new Date().toISOString() })
          .eq('id', inviteRow.id),
        service.rpc('increment_user_coins', { p_user_id: user.id, p_amount: 50 }),
        service.from('coin_log').insert({
          user_id: user.id,
          crew_id: null,
          coins:   50,
          source:  'seed',
        }),
        fetch(fnUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            user_id: inviteRow.inviter_id,
            type:    'recruit_arrived',
            payload: { new_username: profile?.username ?? 'A new warrior' },
          }),
        }),
      ])
    }
  }

  revalidatePath('/home')
  revalidateTag(`crew-members:${crewId}`, 'max')
  redirect(`/chat/${crewId}?welcome=1`)
}
