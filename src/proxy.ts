import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/home', '/chat', '/vault', '/party', '/profile', '/onboarding', '/friends', '/dm']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Extend cookie lifetime to 30 days so the cookie outlives the 1-hour
          // access token. On Android PWA the browser clears the cookie when it
          // expires — even though the refresh token inside is still valid — which
          // forces a re-login on every relaunch or after ~1h idle. With a 30-day
          // cookie, getSession() finds the (possibly expired) JWT, detects expiry,
          // and exchanges the refresh token for a new one automatically.
          const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days in seconds
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, maxAge: SESSION_MAX_AGE })
          )
        },
      },
    }
  )

  // getSession() reads the JWT from cookies — no network roundtrip.
  // getUser() hits the Supabase Auth server on every request (+100–300 ms per nav).
  // The actual per-page auth gates use getSession() too, so this is consistent.
  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  if (!session && PROTECTED.some((prefix) => pathname.startsWith(prefix))) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest\\.json|sw\\.js|workbox-.*|offline\\.html).*)',
  ],
}
