import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/shared/supabase/server'
import { PENDING_INVITE_COOKIE_NAME } from '@/shared/utils/pendingInviteCookie'
import { completeCrewJoin } from '@/shared/utils/joinCrew'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Set by JoinGroupStep (via setPendingInviteCookie) right before it called
  // signInWithGoogle, if this OAuth round trip started from the "invite
  // success" screen rather than a plain sign-in. See pendingInviteCookie.ts.
  const pendingInvite = request.cookies.get(PENDING_INVITE_COOKIE_NAME)?.value

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

      // Sync Google avatar_url on login, but skip if user has set a custom photo.
      const avatarUrl = user.user_metadata?.avatar_url as string | undefined
      if (avatarUrl) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('avatar_url, custom_avatar')
          .eq('id', user.id)
          .single()
        const profile = existing as { avatar_url: string | null; custom_avatar: boolean } | null
        if (profile && !profile.custom_avatar && profile.avatar_url !== avatarUrl) {
          await supabase.from('profiles')
            .update({ avatar_url: avatarUrl })
            .eq('id', user.id)
        }
      }

      // Signup is public: any authenticated Google account that hasn't
      // finished the Create Profile screen yet goes straight there. Can't
      // key this off `profiles.username` — the handle_new_user trigger
      // auto-fills a placeholder username (email local-part) the instant
      // auth.users gets a row, so that column is never actually empty for a
      // brand-new signup. `onboarding_completed` is only ever set once
      // completeSignupAction (Setup Profile's "Create Account") succeeds.
      const { data: profile } = await supabase.from('profiles').select('onboarding_completed').eq('id', user.id).maybeSingle()

      if (profile?.onboarding_completed) {
        // Returning user (already has a profile) — if there's a pending Join
        // a Group invite, finish that join now via the just-established
        // session (same RPC joinCrewFromHomeAction uses for a normal
        // in-app join) and land in the chat room instead of /home.
        if (pendingInvite) {
          const { data: crewId } = await supabase.rpc('join_crew', {
            p_invite_code: pendingInvite.trim().toUpperCase(),
          })
          if (crewId) {
            await completeCrewJoin(supabase, user.id, crewId as string)
            const response = NextResponse.redirect(`${origin}/chat/${crewId}`)
            response.cookies.delete(PENDING_INVITE_COOKIE_NAME)
            return response
          }
          // Stale/deleted by the time sign-in finished (e.g. the crew was
          // removed in between) — send them back to JoinGroupStep with the
          // same red "doesn't exist" error an invalid code shows, instead
          // of silently landing on /home as if nothing was wrong.
          const response = NextResponse.redirect(`${origin}/login?inviteError=1&code=${encodeURIComponent(pendingInvite)}`)
          response.cookies.delete(PENDING_INVITE_COOKIE_NAME)
          return response
        }
        return NextResponse.redirect(`${origin}/home`)
      }

      // Brand-new account — CreateProfileStep resumes the pending invite (if
      // any) itself once profile creation finishes, so the cookie is left in
      // place rather than cleared here.
      return NextResponse.redirect(`${origin}/login?newAccount=1`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
