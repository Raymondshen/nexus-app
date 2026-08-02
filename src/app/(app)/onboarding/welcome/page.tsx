import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import { ChatroomEmptyScreen } from '@/features/home/screens/ChatroomEmptyScreen'

// Reached only via /onboarding/birthday's no-crew branch (an existing account
// backfilling a missing birthday with no crew in query-string context — see
// home/page.tsx's `redirect('/onboarding/birthday')` for the birthday-missing
// case). Every create/join flow (CreateSquadPage -> /onboarding/class,
// HomeActionSheet's join flow) now redirects straight to /chat/[crewId] and
// never touches this route, so a `crew` param here would be unreachable in
// practice — handled defensively below rather than assumed impossible.
//
// Shows the same Figma 774:20383 "chatroom - empty" screen /home renders for
// a zero-membership user (ChatroomEmptyScreen) — this route's own prior UI
// (WelcomeClient) predated the current design system and duplicated the same
// create/join decision with a legacy pixel-art look; removed outright rather
// than kept in a second, divergent style.
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string }>
}) {
  const { crew: crewId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (crewId) redirect(`/chat/${crewId}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url, coins, gem_balance')
    .eq('id', user.id)
    .single()

  return (
    <ChatroomEmptyScreen
      userId={user.id}
      username={profile?.username ?? ''}
      avatarUrl={profile?.avatar_url ?? null}
      initialCoins={profile?.coins ?? 0}
      initialGemBalance={profile?.gem_balance ?? 0}
    />
  )
}
