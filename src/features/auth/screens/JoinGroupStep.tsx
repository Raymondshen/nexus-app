'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { PageFooter } from '@/shared/components/ui/PageFooter'
import { InputField } from '@/shared/components/ui/InputField'
import { Button } from '@/shared/components/ui/Button'
import { ProfileHeroBackground } from '@/shared/components/ui/ProfileHeroBackground'
import { SwipePreviewCard, COVER_FADE_GRADIENT } from '@/shared/components/ui/SwipePreviewCard'
import { useSpriteFrameLoop } from '@/shared/hooks/useSpriteFrameLoop'
import { checkInviteCodeAction, joinCrewSessionAction, type JoinableCrewPreview } from '@/app/(auth)/login/actions'
import { signInWithGoogle } from '@/shared/supabase/auth'
import { setPendingInviteCookie } from '@/shared/utils/pendingInviteCookie'
import type { RoomMeta } from '@/features/chat/store/chatRoomPeekStore'

// Figma 774:20348 "onboarding - group empty" — a 9-frame sleep-loop sprite
// (public/sprites/ghost/sleep/ghost-sleeping_0001.webp…0009.webp, 1-indexed,
// same asset ChatRoomBrowseSheet's now-removed SleepingGhost used to render)
// inside a dashed skeleton card standing in for "no group loaded yet" until a
// valid invite code resolves to a real one. Frame-cycling via the shared
// useSpriteFrameLoop hook (RainbowGhost's own pattern, ChatRoomBrowseSheet.tsx)
// for prefers-reduced-motion support; crop numbers are this node's own
// (`left: -45.39%, top: -21.7%, size: 168.17%` inside a 64×64 box).
const SLEEP_FRAME_COUNT = 9
const SLEEP_FRAME_MS    = 200

function SleepingGhost() {
  const frame = useSpriteFrameLoop(SLEEP_FRAME_COUNT, SLEEP_FRAME_MS)

  return (
    <div
      className="absolute top-1/2 left-1/2 overflow-hidden pointer-events-none"
      style={{ width: 64, height: 64, transform: 'translate(-50%, -50%)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small looping pixel sprite, next/image adds no value here */}
      <img
        src={`/sprites/ghost/sleep/ghost-sleeping_${String(frame + 1).padStart(4, '0')}.webp`}
        alt=""
        aria-hidden="true"
        style={{
          position:       'absolute',
          left:           '-45.39%',
          top:            '-21.7%',
          width:          '168.17%',
          height:         '168.17%',
          maxWidth:       'none',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  )
}

// Figma 784:5792 "onboarding - Invite Success" — the found-a-valid-code state's
// full-page background: the crew's own cover image (ProfileHeroBackground is
// generic full-bleed-cover-image markup despite its "Profile" name — reused
// rather than re-hand-rolling the same img/supabaseImageLoader boilerplate) +
// COVER_FADE_GRADIENT (SwipePreviewCard.tsx) so the header/card/form stay
// legible over an arbitrary photo — see that constant's own doc comment for
// why it isn't on either canonical cover-scrim token.
const CODE_NOT_FOUND_ERROR = 'The group code you’ve entered doesn’t exist.'

// Shared by handleCodeChange and the `initialStaleCode` seed below —
// `initialStaleCode` comes from a URL query param (LoginForm's
// `staleInviteCode`, itself from /auth/callback's `?code=`), and unlike a
// native input's `maxLength` (which only restricts *typing*, not a
// JS-supplied initial value), a hand-crafted/oversized query param would
// otherwise land in the field unsanitized.
function sanitizeInviteCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

type FoundCrew = JoinableCrewPreview & {
  // Whether the visitor already had a session when the code was checked —
  // drives the found-crew screen's CTA: "Join Group" (joins directly, no
  // Google flow needed) if true, "Continue with Google" if not.
  alreadySignedIn: boolean
}

// Landed here from LoginForm's landing step ("Join A Group" button, both for a
// brand-new visitor and a returning user who isn't signed in yet — neither has
// a Nexus session at this point). Three Figma states share this one screen:
// 774:20348 "group empty" (nothing typed/checked yet), 774:20922 "invite
// invalid" (checked, no match), 784:5792 "Invite Success" (checked, matched —
// full-page crew background + the real SwipePreviewCard + green helper text).
//
// Tapping Join Group calls checkInviteCodeAction, a pure read (no join
// performed) that always shows the found-crew screen on a match, regardless
// of auth state — the CTA there just adapts:
//   - not signed in   → "Continue with Google": stashes the code in a
//     short-lived cookie (setPendingInviteCookie) and starts the same native
//     signInWithGoogle() flow the landing screen's own Sign In button uses.
//     signInWithOAuth navigates the whole tab out to accounts.google.com and
//     back, so any in-memory/React state here is gone by the time it
//     returns — the cookie is what survives that round trip. Two different
//     places resume the join once signed in, depending on whether this was a
//     returning or brand-new account (mirroring /auth/callback's own
//     existing branch for that):
//       - returning user → /auth/callback itself finishes the join and
//         redirects straight to /chat/{crewId} (see that route's comment).
//       - brand-new user → /auth/callback can't join yet (no profile row
//         exists until Create Profile finishes), so it redirects to
//         /login?newAccount=1 as usual, leaving the cookie in place;
//         CreateProfileStep resumes it after a successful signup instead
//         (see its own comment).
//   - already signed in → "Join Group": calls joinCrewSessionAction directly
//     (handleConfirmJoin below) and redirects to /chat/{crewId} on success —
//     no Google round trip needed, there's already a session.
//
// A code that was valid when first checked can still go stale by the time
// any of the three join attempts above actually runs (the crew got deleted,
// the invite regenerated, etc.). All three land back here on failure —
// handleConfirmJoin directly, the other two via LoginForm's
// `staleInviteCode` prop (threaded down as `initialStaleCode`) — showing the
// exact same red "doesn't exist" error a bad code typed directly into this
// screen would, rather than silently landing on /home (or the chat room)
// looking like nothing went wrong.
export function JoinGroupStep({
  onBack,
  initialStaleCode,
  initialCode,
}: {
  // Optional — when omitted, PageHeader falls back to useSlideBack() context
  // (see JoinGroupPage, the authenticated-route wrapper that renders this
  // inside a real SlidePage). LoginForm's pre-auth usage isn't under a
  // SlidePage at all, so it still passes its own local step-back function.
  onBack?: () => void
  initialStaleCode?: string
  // A code shared via InviteCodeCard's "Join my group on {name} — {link}"
  // copy text (`/login?code=XXX`, see login/page.tsx's `code` param and
  // LoginForm's `sharedInviteCode` prop) — pre-fills the field AND
  // auto-checks it on mount (see the effect below), unlike
  // initialStaleCode, which pre-fills but shows its error immediately
  // instead of re-checking a code already known to be stale. Ignored if
  // initialStaleCode is also set (that bounce-back case always wins).
  initialCode?: string
}) {
  const router = useRouter()
  const [code, setCode] = useState(() => sanitizeInviteCode(initialStaleCode ?? initialCode ?? ''))
  const [error, setError] = useState<string | null>(initialStaleCode ? CODE_NOT_FOUND_ERROR : null)
  const [checking, setChecking] = useState(false)
  const [foundCrew, setFoundCrew] = useState<FoundCrew | null>(null)
  const [signInLoading, setSignInLoading] = useState(false)
  const [joining, setJoining] = useState(false)

  function handleCodeChange(value: string) {
    setCode(sanitizeInviteCode(value))
    // Both are tied to the code that was actually checked — once the user
    // starts changing it, neither describes the current value anymore.
    setError(null)
    setFoundCrew(null)
  }

  const canSubmit = code.length === 6

  async function checkCode(codeToCheck: string) {
    if (codeToCheck.length !== 6 || checking) return
    setChecking(true)
    setError(null)
    try {
      const result = await checkInviteCodeAction(codeToCheck)
      if (!result.valid) {
        setError(CODE_NOT_FOUND_ERROR)
        return
      }
      setFoundCrew({ ...result.crew, alreadySignedIn: result.alreadySignedIn })
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setChecking(false)
    }
  }

  function handleJoinGroup() {
    if (!canSubmit) return
    checkCode(code)
  }

  // Deep-link entry (InviteCodeCard's shared "join my group" link) — check the
  // shared code automatically instead of making the recipient re-type/re-tap
  // a code they already arrived with. Skipped when initialStaleCode is also
  // set — that one's already known-bad, re-checking it would just reproduce
  // the same error a beat later. Genuine fetch-on-mount (one of the two
  // legitimate effect uses per React's own docs) — checkCode's own
  // setChecking(true) is what react-hooks/set-state-in-effect flags here.
  useEffect(() => {
    if (initialStaleCode || !initialCode) return
    const clean = sanitizeInviteCode(initialCode)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (clean.length === 6) checkCode(clean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleContinueWithGoogle() {
    setSignInLoading(true)
    setPendingInviteCookie(code)
    try {
      await signInWithGoogle()
    } catch {
      setSignInLoading(false)
    }
  }

  async function handleConfirmJoin() {
    if (!foundCrew || joining) return
    setJoining(true)
    try {
      const result = await joinCrewSessionAction(code)
      if ('crewId' in result) {
        router.push(`/chat/${result.crewId}`)
        return
      }
      // Stale by the time they confirmed (crew deleted, etc.) — back to the
      // plain error state instead of doing nothing.
      setFoundCrew(null)
      setError(CODE_NOT_FOUND_ERROR)
    } catch {
      setFoundCrew(null)
      setError(CODE_NOT_FOUND_ERROR)
    } finally {
      setJoining(false)
    }
  }

  const room: (RoomMeta & { id: string }) | null = foundCrew
    ? {
        id:                  foundCrew.id,
        name:                foundCrew.name,
        imageUrl:            foundCrew.imageUrl,
        backgroundImageUrl:  foundCrew.backgroundImageUrl,
        level:               foundCrew.level,
        memberCount:         foundCrew.memberCount,
        lastMessagePreview:  null,
        lastMessageAt:       null,
        unreadCount:         0,
        onlineMembers:       [],
      }
    : null

  return (
    <div className="flex-1 w-full flex flex-col" style={{ position: 'fixed', inset: 0, background: 'var(--color-background)' }}>
      {foundCrew && (
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <ProfileHeroBackground url={foundCrew.backgroundImageUrl} />
          <div className="absolute inset-0" style={{ backgroundImage: COVER_FADE_GRADIENT }} />
        </div>
      )}

      {/* `relative` so this reliably paints above the absolute background layer
          above — an absolutely-positioned sibling with no z-index otherwise
          stacks above plain in-flow content regardless of DOM order, verified
          directly rather than assumed (a raw Figma export of this node makes
          exactly that mistake — background and content as plain unpositioned
          siblings — which would render the image over the header/text). */}
      <div className="relative flex-1 w-full flex flex-col">
        <PageHeader variant="auth" title="Join a Group" onBack={onBack} />

        <div
          className="flex-1 min-h-0 flex flex-col items-center w-full"
          style={{ paddingLeft: 'var(--x5)', paddingRight: 'var(--x5)' }}
        >
          {/* Group preview — dashed empty-state skeleton until a code resolves,
              then the real SwipePreviewCard (Figma 784:5792 reuses
              ChatRoomBrowseSheet's own Groups-row card, just at 210×280 to
              match this screen's own card footprint instead of that row's
              180×240). */}
          <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
            <div className="flex flex-col items-center" style={{ gap: 'var(--x7)' }}>
              {room ? (
                <SwipePreviewCard
                  room={room}
                  width={210}
                  height={280}
                  border="1px solid var(--color-border-hover)"
                  overlayGradient={COVER_FADE_GRADIENT}
                />
              ) : (
                <div
                  className="relative flex flex-col items-center justify-end overflow-hidden flex-shrink-0"
                  style={{
                    width: 210,
                    height: 280,
                    padding: 'var(--x5)',
                    border: '1px dashed var(--color-border-hover)',
                    borderRadius: 'var(--x3)',
                  }}
                >
                  <SleepingGhost />
                  <div className="flex items-center w-full flex-shrink-0" style={{ gap: 8 }}>
                    <div className="flex-shrink-0" style={{ width: 32, height: 32, background: 'var(--color-muted)' }} />
                    <div className="flex flex-col flex-1 min-w-0 justify-center overflow-hidden" style={{ gap: 'var(--x2)' }}>
                      <div className="w-full flex-shrink-0" style={{ height: 16, background: 'var(--color-muted)' }} />
                      <div className="w-full flex-shrink-0" style={{ height: 12, background: 'var(--color-muted)' }} />
                    </div>
                  </div>
                </div>
              )}
              <p
                className="font-body font-bold text-center leading-none truncate uppercase"
                style={{
                  fontSize: 16,
                  color: foundCrew ? 'var(--color-primary)' : 'var(--color-muted)',
                  maxWidth: 210,
                  fontVariationSettings: '"opsz" 14',
                }}
              >
                {foundCrew ? foundCrew.name : 'Group Name'}
              </p>
            </div>
          </div>

          {/* Invite code field — the CTA below lives in the shared PageFooter
              instead (see CLAUDE.md → Page Structure: any subpage with a
              bottom-pinned CTA must use it), so only the field sits in this
              padded content column. */}
          <div className="w-full flex-shrink-0">
            <InputField
              label="Invite Code"
              required
              value={code}
              onChange={handleCodeChange}
              placeholder="ABCDEF"
              helperText="Enter invite code to join the group."
              error={error ?? undefined}
              success={foundCrew
                ? foundCrew.alreadySignedIn
                  ? 'Group found - tap Join Group to join.'
                  : 'Group found - sign in or sign up with Google to join.'
                : undefined}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>
        </div>

        <PageFooter>
          {foundCrew ? (
            foundCrew.alreadySignedIn ? (
              <Button
                type="button"
                variant="filled"
                rounded
                labelFont="body"
                loading={joining}
                disabled={joining}
                className="w-full"
                onClick={handleConfirmJoin}
              >
                Join Group
              </Button>
            ) : (
              <Button
                type="button"
                variant="filled"
                rounded
                labelFont="body"
                loading={signInLoading}
                disabled={signInLoading}
                className="w-full"
                onClick={handleContinueWithGoogle}
              >
                Continue with Google
              </Button>
            )
          ) : (
            <Button
              type="button"
              variant="filled"
              rounded
              labelFont="body"
              loading={checking}
              disabled={!canSubmit || checking}
              className="w-full"
              onClick={handleJoinGroup}
            >
              Join Group
            </Button>
          )}
        </PageFooter>
      </div>
    </div>
  )
}
