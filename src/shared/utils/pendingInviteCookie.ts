// Carries a Join a Group invite code across the Google OAuth round trip (and,
// for a brand-new account, through the intermediate Create Profile step too)
// so JoinGroupStep's "Continue with Google" button can resume the join once
// the visitor is signed in — see JoinGroupStep.tsx's own doc comment for the
// full flow. A plain cookie rather than sessionStorage: signInWithOAuth
// navigates the whole tab away to accounts.google.com and back, and cookies
// are the standard mechanism proven to survive that kind of cross-origin
// round trip (sessionStorage generally does too in practice, but cookies are
// also what the server-side /auth/callback route handler can read directly,
// with no client hop needed for that half of the flow). Not sensitive — just
// a 6-character invite code — so no HttpOnly/Secure hardening beyond a short
// expiry is needed; it's set/read directly via `document.cookie`.
export const PENDING_INVITE_COOKIE_NAME = 'nexus_pending_invite'

const PENDING_INVITE_MAX_AGE_S = 600 // 10 minutes — comfortably covers a Google OAuth round trip

export function setPendingInviteCookie(code: string) {
  document.cookie = `${PENDING_INVITE_COOKIE_NAME}=${encodeURIComponent(code)}; path=/; max-age=${PENDING_INVITE_MAX_AGE_S}; samesite=lax`
}

export function readPendingInviteCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${PENDING_INVITE_COOKIE_NAME}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function clearPendingInviteCookie() {
  document.cookie = `${PENDING_INVITE_COOKIE_NAME}=; path=/; max-age=0`
}
