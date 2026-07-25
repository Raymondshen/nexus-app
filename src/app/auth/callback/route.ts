import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/shared/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Sync Google avatar_url on login, but skip if user has set a custom photo.
      const { data: { user } } = await supabase.auth.getUser()
      const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
      if (user && avatarUrl) {
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

      // Signup is public: any authenticated Google account without a Nexus
      // profile yet goes straight to the Create Profile screen.
      const { data: profile } = user
        ? await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle()
        : { data: null }
      const destination = profile?.username
        ? `${origin}/home`
        : `${origin}/login?newAccount=1`

      return NextResponse.redirect(destination)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
