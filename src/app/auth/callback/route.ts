import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Cookie set by signInWithGoogleForInvite() before OAuth; SameSite=Lax survives
  // the cross-site redirect from Google back to this callback.
  const intent = request.cookies.get('nexus_auth_intent')?.value

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Sync Google avatar_url on every login so returning users stay up to date
      const { data: { user } } = await supabase.auth.getUser()
      const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
      if (user && avatarUrl) {
        await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id)
      }
      const destination = intent === 'invite'
        ? `${origin}/login?flow=invite&step=2`
        : `${origin}/home`
      const response = NextResponse.redirect(destination)
      response.cookies.delete('nexus_auth_intent')
      return response
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
