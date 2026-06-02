import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Protected path prefixes — unauthenticated requests are redirected to /login
const PROTECTED = ['/home', '/chat', '/vault', '/party', '/profile', '/onboarding']

export async function middleware(request: NextRequest) {
  // Start with a pass-through response so cookies can be written onto it
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
          // Write cookies onto both the request (so later middleware sees them)
          // and the response (so the browser receives the refreshed session)
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() refreshes the session if the access token has expired.
  // This is the ONE place in the request lifecycle where a Supabase auth
  // network call is made — server components use getSession() (cookie-only,
  // zero network) after this has run.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && PROTECTED.some((prefix) => pathname.startsWith(prefix))) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest\\.json|sw\\.js|workbox-.*|offline\\.html).*)',
  ],
}
