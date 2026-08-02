'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/shared/components/ui/Button'
import DelayedSkeleton from '@/shared/components/ui/DelayedSkeleton'
import { useSpriteFrameLoop } from '@/shared/hooks/useSpriteFrameLoop'
import {
  GHOST_LAUNCH_FRAME_COUNT,
  GHOST_LAUNCH_FRAME_MS,
  ghostLaunchFrameSrc,
  preloadGhostLaunchFrames,
} from '@/shared/constants/ghostLaunchSprite'
import { signInWithGoogle } from '@/shared/supabase/auth'

type Step =
  | 'landing'
  | 'create-profile' // display name + class + profile details (after Google oauth)
  | 'join-group'      // invite code entry — reachable logged out, see JoinGroupStep

// Lazily loaded — CreateProfileStep pulls in AvatarUploadModal/
// BackgroundUploadModal, 9 InputFields, and the social-link validation
// pipeline, none of which a plain landing-screen visit (the common case:
// every anonymous visitor, and every returning user's OAuth round trip) ever
// needs. Splitting it into its own chunk keeps that weight out of the
// landing screen's first paint. `ssr` is intentionally left at its default
// (true) rather than `false`: the ?newAccount=1 redirect can make
// 'create-profile' the very first render (including the SSR pass), and that
// path should still get full server-rendered HTML instead of a client-only
// loading flash — code-splitting still applies for the plain-landing case
// since that branch never even evaluates this import at runtime.
const CreateProfileStep = dynamic(
  () => import('./CreateProfileStep').then((m) => m.CreateProfileStep),
  { loading: () => <CreateProfileStepFallback /> }
)

function CreateProfileStepFallback() {
  return (
    <DelayedSkeleton>
      <div
        className="flex-1 w-full flex flex-col"
        style={{ position: 'fixed', inset: 0, background: 'var(--color-background)' }}
      >
        <div className="w-full animate-pulse" style={{ height: 240, background: 'var(--color-surface)' }} />
        <div className="flex flex-col" style={{ gap: 20, padding: 16 }}>
          <div className="w-full h-[50px] bg-border animate-pulse" />
          <div className="w-full h-[50px] bg-border animate-pulse" />
          <div className="w-full h-[50px] bg-border animate-pulse" />
        </div>
      </div>
    </DelayedSkeleton>
  )
}

// Same reasoning as CreateProfileStep above — JoinGroupStep pulls in PageHeader
// + InputField, neither of which the plain-landing path (the common case)
// otherwise touches. `ssr` stays at its default (true): unlike create-profile
// there's no query-param entry that can make this the very first render, but
// leaving it on costs nothing and keeps this consistent with the sibling step.
const JoinGroupStep = dynamic(
  () => import('./JoinGroupStep').then((m) => m.JoinGroupStep),
  { loading: () => <JoinGroupStepFallback /> }
)

function JoinGroupStepFallback() {
  return (
    <DelayedSkeleton>
      <div
        className="flex-1 w-full flex flex-col"
        style={{ position: 'fixed', inset: 0, background: 'var(--color-background)' }}
      >
        <div className="w-full animate-pulse" style={{ height: 40, margin: 16, background: 'var(--color-surface)' }} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse" style={{ width: 210, height: 280, background: 'var(--color-surface)' }} />
        </div>
        <div className="flex flex-col flex-shrink-0" style={{ gap: 20, padding: 16 }}>
          <div className="w-full h-[50px] bg-border animate-pulse" />
          <div className="w-full h-12 bg-border animate-pulse" />
        </div>
      </div>
    </DelayedSkeleton>
  )
}

// Landing screen ghost (Figma 774:19681 "launch 1") — the same frame-cycling
// sprite as LaunchSplashContent's wordmark ghost (frame count/interval/path
// shared via ghostLaunchSprite.ts), just spec'd at 64px here instead of 48px.
// Not launch-critical (unlike LaunchSplashContent's copy), so this one goes
// through the shared useSpriteFrameLoop hook rather than a bespoke effect —
// but still needs its own one-time frame preload (see the effect below):
// useSpriteFrameLoop only cycles an index, it doesn't know the frames are
// image assets that need warming, and without it the first cycle through all
// 9 frames on a cold cache can flash a blank frame right on the very first
// screen a logged-out visitor sees.
const GHOST_PX = 64

// The 56x56 sprite frames carry a lot of baked-in transparent padding around
// the actual ghost — measured directly off each frame's alpha channel (union
// bounding box across all 9 frames, so the crop window is guaranteed to fit
// every walk-cycle pose without clipping): content sits roughly in
// x:[16,38] y:[15,38] of the 56x56 canvas. Rendering at 100%
// (LaunchSplashContent's `objectFit: contain` treatment) leaves the ghost
// looking small inside its container. Figma's own export for this node
// applies the same "zoom past the padding" crop (~182% size / -41% offset);
// these values are re-derived from this asset's real bounding box (crop
// window x:[11,43] y:[10.5,42.5], padded evenly around that bbox) rather than
// assumed, so the fill is pixel-accurate for the actual file on disk.
const GHOST_CROP_SCALE   = '175%'
const GHOST_CROP_LEFT    = '-34.38%'
const GHOST_CROP_TOP     = '-32.81%'

function LandingGhost() {
  const frame = useSpriteFrameLoop(GHOST_LAUNCH_FRAME_COUNT, GHOST_LAUNCH_FRAME_MS)

  useEffect(() => {
    preloadGhostLaunchFrames()
  }, [])

  return (
    <div
      className="absolute top-1/2 left-1/2 overflow-hidden pointer-events-none"
      style={{ width: GHOST_PX, height: GHOST_PX, transform: 'translate(-50%, -50%)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ghostLaunchFrameSrc(frame)}
        alt=""
        aria-hidden="true"
        style={{
          position:  'absolute',
          left:      GHOST_CROP_LEFT,
          top:       GHOST_CROP_TOP,
          width:     GHOST_CROP_SCALE,
          height:    GHOST_CROP_SCALE,
          maxWidth:  'none',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  )
}

export function LoginForm({
  newAccount,
  staleInviteCode,
}: {
  newAccount?: string
  // Set by /auth/callback (via ?inviteError=1&code=...) when a pending Join a
  // Group invite went stale between JoinGroupStep's "Continue with Google" tap
  // and sign-in actually finishing (crew deleted, etc.) — see JoinGroupStep's
  // own doc comment. Jumps straight to the join-group step with that code
  // pre-filled and its red error already showing, same as CreateProfileStep's
  // onInviteJoinFailed callback below does for the brand-new-account case.
  staleInviteCode?: string
}) {
  const [step, setStep] = useState<Step>(
    newAccount === '1' ? 'create-profile' : staleInviteCode ? 'join-group' : 'landing'
  )
  const [error, setError]                 = useState<string | null>(null)
  const [signInLoading, setSignInLoading] = useState(false)
  const [pendingStaleCode, setPendingStaleCode] = useState(staleInviteCode)

  // ── Landing (Figma 774:19569) ───────────────────────────────────────────
  // Full-bleed screen, no boxed card. Signup is public: the only entry point
  // is Google sign-in. A new Google account (no Nexus profile yet) is routed
  // straight to the create-profile step server-side by /auth/callback
  // (?newAccount=1). Join A Group routes to the join-group step (Figma
  // 774:20348) — reachable while logged out, since a new/non-signed-in visitor
  // should be able to start entering a friend's invite code immediately rather
  // than being forced through sign-in first.
  if (step === 'landing') {
    return (
      <div
        className="relative flex-1 flex flex-col items-center justify-end w-full"
        style={{
          gap: 'var(--x6)',
          paddingLeft: 'var(--x5)',
          paddingRight: 'var(--x5)',
          paddingTop: 'max(env(safe-area-inset-top), var(--x8))',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
        }}
      >
        <LandingGhost />

        <div className="flex flex-col items-start w-full" style={{ gap: 'var(--x2)' }}>
          <h1
            className="font-body font-black text-primary uppercase leading-[1.1]"
            style={{ fontSize: 48, letterSpacing: '0.96px', fontVariationSettings: '"opsz" 14' }}
          >
            NEXUS
          </h1>
          <p
            className="font-body font-normal text-secondary w-full leading-[1.5]"
            style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
          >
            Turn your everyday conversations with your group into shared challenges and rewards.
          </p>
        </div>

        <div className="flex flex-col items-start w-full" style={{ gap: 'var(--x5)' }}>
          {error && (
            <p
              className="font-body font-normal w-full leading-relaxed"
              style={{ fontSize: 'var(--xs)', color: 'var(--red)', fontVariationSettings: '"opsz" 14' }}
            >
              {error}
            </p>
          )}

          <Button
            type="button"
            variant="filled"
            rounded
            labelFont="body"
            loading={signInLoading}
            disabled={signInLoading}
            className="w-full"
            onClick={async () => {
              setError(null)
              setSignInLoading(true)
              try { await signInWithGoogle() } catch { setSignInLoading(false) }
            }}
          >
            Sign In With Google
          </Button>

          <Button
            type="button"
            variant="outlined"
            color="primary"
            rounded
            labelFont="body"
            className="w-full"
            onClick={() => {
              // A fresh manual entry, not the stale-code bounce-back path —
              // clear any leftover code from a previous bounce-back so this
              // doesn't resurrect it on a JoinGroupStep instance that has
              // nothing to do with it.
              setPendingStaleCode(undefined)
              setStep('join-group')
            }}
          >
            Join A Group
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'join-group') {
    return <JoinGroupStep onBack={() => setStep('landing')} initialStaleCode={pendingStaleCode} />
  }

  // ── Create Profile (Figma 547:2289) ──────────────────────────────────────
  // Landed here after a fresh Google sign-in with no Nexus profile yet. The
  // step itself (state, effects, JSX) lives in CreateProfileStep.tsx, lazily
  // imported above — this component only owns the step switch.
  return (
    <CreateProfileStep
      onBack={() => setStep('landing')}
      onBounceToLanding={(message) => {
        setStep('landing')
        setError(message)
      }}
      onInviteJoinFailed={(code) => {
        setPendingStaleCode(code)
        setStep('join-group')
      }}
    />
  )
}
