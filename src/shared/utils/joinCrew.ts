import { revalidatePath, revalidateTag } from 'next/cache'
import type { createClient } from '@/shared/supabase/server'

type SessionClient = Awaited<ReturnType<typeof createClient>>

// Finishes a crew join after the `join_crew` RPC has already succeeded — the
// system "JOIN:{username}" chat message announcing the new member (same
// convention every join path in the app uses) plus the cache invalidation
// the newly-joined member's own view of the crew (and every other member's
// member-list view) depends on. Factored out so every join path shares this
// instead of drifting: `joinCrewFromHomeAction` (home/actions.ts, the
// original — Home's own Join Squad flow), `joinCrewSessionAction`
// (login/actions.ts — JoinGroupStep's already-signed-in "Join Group" CTA and
// CreateProfileStep's post-signup resume), and /auth/callback's own inline
// join for a returning user finishing a pending Join a Group invite.
export async function completeCrewJoin(
  supabase: SessionClient,
  userId: string,
  crewId: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle()

  await supabase.from('messages').insert({
    crew_id:      crewId,
    user_id:      userId,
    content:      `JOIN:${(profile as { username?: string } | null)?.username ?? 'warrior'}`,
    message_type: 'system',
    element_type: null,
    xp_awarded:   0,
  })

  revalidatePath('/home')
  revalidateTag(`crew-members:${crewId}`, 'max')
}
