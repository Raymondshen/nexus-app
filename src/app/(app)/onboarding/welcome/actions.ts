'use server'

import { redirect } from 'next/navigation'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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

  // Brief welcome system message
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  await supabase.from('messages').insert({
    crew_id:      crewId,
    user_id:      user.id,
    content:      `⚔️ ${profile?.username ?? 'A warrior'} has entered the Nexus. The crew grows stronger.`,
    message_type: 'system',
    element_type: null,
    xp_awarded:   0,
  })

  // Process app invite if present
  if (inviteCode) {
    const service = createServiceClient()

    const { data: inviteRow } = await service
      .from('app_invites')
      .select('id, inviter_id, used')
      .eq('code', inviteCode)
      .eq('used', false)
      .maybeSingle()

    if (inviteRow && inviteRow.inviter_id !== user.id) {
      // Idempotent: skip if seed coins already awarded
      const { data: alreadySeed } = await service
        .from('coin_log')
        .select('id')
        .eq('user_id', user.id)
        .eq('source', 'seed')
        .maybeSingle()

      if (!alreadySeed) {
        const { data: newProfile } = await service
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single()

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
              payload: { new_username: newProfile?.username ?? 'A new warrior' },
            }),
          }),
        ])
      }
    }
  }

  revalidatePath('/home')
  revalidateTag(`crew-members:${crewId}`, 'max')
  redirect(`/chat/${crewId}?welcome=1`)
}
