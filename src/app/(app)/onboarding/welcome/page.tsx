import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/shared/supabase/server'
import WelcomeClient from '@/features/onboarding/screens/WelcomeClient'

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string; invite?: string }>
}) {
  const { crew: crewId, invite } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const userId = user.id

  let inviterUsername: string | null = null
  let validInviteCode: string | null = null

  if (invite) {
    const service = createServiceClient()

    const { data: inviteRow } = await service
      .from('app_invites')
      .select('id, inviter_id, used')
      .eq('code', invite)
      .eq('used', false)
      .maybeSingle()

    if (inviteRow && inviteRow.inviter_id !== userId) {
      const { data: inviterProfile } = await service
        .from('profiles')
        .select('username')
        .eq('id', inviteRow.inviter_id as string)
        .single()

      inviterUsername = inviterProfile?.username ?? null

      if (crewId) {
        // User completed class selection with this invite in URL — process now
        const { data: alreadySeed } = await service
          .from('coin_log')
          .select('id')
          .eq('user_id', userId)
          .eq('source', 'seed')
          .maybeSingle()

        if (!alreadySeed) {
          const { data: newProfile } = await service
            .from('profiles')
            .select('username')
            .eq('id', userId)
            .single()

          const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`

          await Promise.all([
            service
              .from('app_invites')
              .update({ used: true, used_by: userId, used_at: new Date().toISOString() })
              .eq('id', inviteRow.id),
            service.rpc('increment_user_coins', { p_user_id: userId, p_amount: 50 }),
            service.from('coin_log').insert({
              user_id: userId,
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
      } else {
        // No crew yet — pass invite code to client for use during crew join
        validInviteCode = invite
      }
    }
  }

  return (
    <WelcomeClient
      crewId={crewId ?? null}
      inviterUsername={inviterUsername}
      validInviteCode={validInviteCode}
    />
  )
}
