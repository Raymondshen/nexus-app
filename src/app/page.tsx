import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'

// Was redirect('/onboarding') — that route (plus its /onboarding/create and
// /onboarding/join children) was a fully separate, legacy pixel-art create/join
// flow that predated the current design system and duplicated what /home's own
// server-side launch redirect already does correctly: land a signed-in user in
// their pinned squad, or the empty-groups screen (ChatroomEmptyScreen) if they
// have none. Removed outright rather than kept as a second divergent path — see
// CLAUDE.md for the current /home/create + /home/join flow.
export default async function RootPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    redirect('/home')
  } else {
    redirect('/login')
  }
}
