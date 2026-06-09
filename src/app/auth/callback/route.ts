import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Cookie set by signInWithGoogleForInvite() before OAuth; SameSite=Lax survives
  // the cross-site redirect from Google back to this callback.
  const intent = request.cookies.get('nexus_auth_intent')?.value
  // Code was pre-validated before OAuth and stored as a cookie to survive the redirect
  const inviteCode = request.cookies.get('nexus_invite_code')?.value

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Sync Google avatar_url on login, but skip if user has set a custom photo.
      const { data: { user } } = await supabase.auth.getUser()
      const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
      if (user && avatarUrl) {
        await supabase.from('profiles')
          .update({ avatar_url: avatarUrl })
          .eq('id', user.id)
          .eq('custom_avatar', false)
      }

      let destination: string
      if (intent === 'invite') {
        // Carry the pre-validated invite code into the profile-setup step
        const codeParam = inviteCode ? `&code=${encodeURIComponent(inviteCode)}` : ''
        destination = `${origin}/login?flow=invite&step=2${codeParam}`
      } else {
        // "SIGN IN WITH GOOGLE" path: only admit users who already have a Nexus profile.
        // New users with no username must get an invite from an existing member.
        const { data: profile } = user
          ? await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle()
          : { data: null }
        destination = profile?.username
          ? `${origin}/home`
          : `${origin}/login?error=no_account`
      }

      const response = NextResponse.redirect(destination)
      response.cookies.delete('nexus_auth_intent')
      response.cookies.delete('nexus_invite_code')
      return response
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
