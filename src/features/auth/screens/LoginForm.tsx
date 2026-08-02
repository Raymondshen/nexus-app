'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/shared/components/ui/Button'
import DelayedSkeleton from '@/shared/components/ui/DelayedSkeleton'
import { GhostLaunchSprite } from '@/shared/components/ui/GhostLaunchSprite'
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

export function LoginForm({
  newAccount,
  staleInviteCode,
  sharedInviteCode,
}: {
  newAccount?: string
  // Set by /auth/callback (via ?inviteError=1&code=...) when a pending Join a
  // Group invite went stale between JoinGroupStep's "Continue with Google" tap
  // and sign-in actually finishing (crew deleted, etc.) — see JoinGroupStep's
  // own doc comment. Jumps straight to the join-group step with that code
  // pre-filled and its red error already showing, same as CreateProfileStep's
  // onInviteJoinFailed callback below does for the brand-new-account case.
  staleInviteCode?: string
  // Set by login/page.tsx's plain `?code=` param (no `inviteError=1`) —
  // InviteCodeCard's shared "Join my group on {name} — {link}" deep link
  // lands here. Jumps straight to the join-group step and auto-checks the
  // code (JoinGroupStep's `initialCode` prop) instead of showing a stale-code
  // error, since this code was never actually tried yet.
  sharedInviteCode?: string
}) {
  const [step, setStep] = useState<Step>(
    newAccount === '1' ? 'create-profile' : (staleInviteCode || sharedInviteCode) ? 'join-group' : 'landing'
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
        <GhostLaunchSprite size={64} />

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
    return (
      <JoinGroupStep
        onBack={() => setStep('landing')}
        initialStaleCode={pendingStaleCode}
        initialCode={pendingStaleCode ? undefined : sharedInviteCode}
      />
    )
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
