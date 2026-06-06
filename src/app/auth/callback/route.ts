import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const flow = searchParams.get('flow')

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
      if (flow === 'invite') {
        return NextResponse.redirect(`${origin}/login?flow=invite&step=2`)
      }
      return NextResponse.redirect(`${origin}/home`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
