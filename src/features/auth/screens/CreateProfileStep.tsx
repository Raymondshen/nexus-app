'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'pixelarticons/react/Plus'
import { Button } from '@/shared/components/ui/Button'
import { InputField } from '@/shared/components/ui/InputField'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { PageFooter } from '@/shared/components/ui/PageFooter'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { AvatarUploadModal } from '@/shared/components/overlays/AvatarUploadModal'
import { BackgroundUploadModal } from '@/shared/components/overlays/BackgroundUploadModal'
import {
  getSignupSessionAction,
  completeSignupAction,
  joinCrewSessionAction,
  type SignupSessionResult,
} from '@/app/(auth)/login/actions'
import { readPendingInviteCookie, clearPendingInviteCookie } from '@/shared/utils/pendingInviteCookie'
import { formatBirthday } from '@/shared/utils/birthday'
import type { AvatarClass } from '@/types'

// The Create Profile screen has never had a class picker (that only ever lived
// in the now-removed reserve-class waitlist step) — every new account gets this
// default avatar_class silently; real per-crew class choice happens later in
// onboarding (crew_members.class, see CLAUDE.md's Onboarding section).
const DEFAULT_AVATAR_CLASS: AvatarClass = 'mage'

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="border px-3 py-2" style={{ background: 'color-mix(in srgb, var(--red) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--red) 50%, transparent)' }}>
      <p className="font-body font-normal leading-relaxed" style={{ fontSize: 'var(--text-xs)', color: 'var(--red)', fontVariationSettings: '"opsz" 14' }}>
        {message}
      </p>
    </div>
  )
}

// Split out of LoginForm.tsx (which otherwise bundled this entire step —
// AvatarUploadModal/BackgroundUploadModal, 9 InputFields, social-link
// validation, etc. — into the same client module as the trivial landing
// screen). Landing is what every anonymous visitor's first paint has to pay
// for; this step is only reached after a fresh Google sign-in with no Nexus
// profile yet, so LoginForm now lazy-loads it via next/dynamic instead of
// importing it eagerly — a plain landing-only visit never fetches this
// module's chunk at all.
//
// `onBack` / `onBounceToLanding` replace what used to be local `goBack`/
// `setStep('landing')` calls directly on LoginForm's own state — this
// component is now fully self-contained (owns all its own form/session
// state) and only needs to ask its parent to switch steps, optionally with
// an error message to surface once back on the landing screen (the "no
// active Google session" bounce-back case).
export function CreateProfileStep({
  onBack,
  onBounceToLanding,
  onInviteJoinFailed,
}: {
  onBack: () => void
  onBounceToLanding: (message: string) => void
  // A pending Join a Group invite (see the cookie/comment below) that turned
  // out stale by the time signup finished — parent (LoginForm) jumps back to
  // JoinGroupStep with this code so it can show the same red error a bad
  // code typed directly there would, instead of this step silently landing
  // on /home looking like nothing went wrong.
  onInviteJoinFailed: (code: string) => void
}) {
  const router = useRouter()

  const [username, setUsername]           = useState('')
  const [firstName, setFirstName]         = useState('')
  const [lastName, setLastName]           = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [loading, setLoading]             = useState(false)
  const [sessionData, setSessionData]     = useState<SignupSessionResult | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)

  const [status,         setStatus]         = useState('')
  // Figma 774:20657 — ISO `YYYY-MM-DD`, same format `profiles.birthday` and
  // onboarding/birthday/actions.ts already use, so a native `<input type="date">`
  // needs no reformatting on save.
  const [birthday,       setBirthday]       = useState('')
  const [avatarUrl,      setAvatarUrl]      = useState<string | null>(null)
  const [backgroundUrl,  setBackgroundUrl]  = useState<string | null>(null)
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [pendingBgFile,     setPendingBgFile]     = useState<File | null>(null)
  const avatarFileInputRef = useRef<HTMLInputElement>(null)
  const bgFileInputRef     = useRef<HTMLInputElement>(null)

  // Fetch the session snapshot (email/coins/gems/avatar) for the hero preview
  // on mount. If somehow no session exists (e.g. a direct link to
  // ?newAccount=1 with no active Google session), bounce back to landing.
  useEffect(() => {
    let cancelled = false
    // Genuine data fetching on mount (React's own "you might not need an
    // effect" guide lists this as one of the two legitimate uses), not a
    // state-mirroring anti-pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingSession(true)

    getSignupSessionAction().then(result => {
      if (cancelled) return
      setSessionData(result)
      if (result.hasSession) {
        setAvatarUrl(result.avatarUrl)
        setLoadingSession(false)
      } else {
        onBounceToLanding('Please sign in again.')
      }
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreateProfile() {
    if (!firstName.trim()) { setError('First name is required.'); return }
    if (!lastName.trim())  { setError('Last name is required.');  return }
    if (!birthday)         { setError('Birthday is required.');   return }
    setError(null)
    setLoading(true)
    try {
      const result = await completeSignupAction(username, DEFAULT_AVATAR_CLASS, firstName, lastName, {
        status,
        birthday,
      })
      if (result.success) {
        // A brand-new account that arrived here via JoinGroupStep's "Continue
        // with Google" (Figma 784:5792) has a pending invite cookie set —
        // /auth/callback couldn't finish that join itself (no profile row
        // existed yet at that point), so it's resumed here instead, now that
        // one does. One-shot: cleared regardless of outcome so a stale code
        // can't be silently retried on some unrelated future sign-in. A code
        // that went stale in the meantime (crew deleted, etc.) bounces back
        // to JoinGroupStep with its error showing, rather than landing on
        // /home looking like nothing was wrong.
        const pendingInvite = readPendingInviteCookie()
        if (pendingInvite) {
          clearPendingInviteCookie()
          try {
            const joinResult = await joinCrewSessionAction(pendingInvite)
            if ('crewId' in joinResult) {
              router.push(`/chat/${joinResult.crewId}`)
            } else {
              onInviteJoinFailed(pendingInvite)
            }
          } catch {
            onInviteJoinFailed(pendingInvite)
          }
          return
        }
        router.push('/home')
      } else {
        setError(result.error ?? 'The rift destabilized. Try again.')
      }
    } catch {
      setError('The rift destabilized. Try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Setup Profile (Figma 774:20648) ──────────────────────────────────────
  // Landed here after a fresh Google sign-in with no Nexus profile yet.
  const sessionSnapshot = sessionData && sessionData.hasSession ? sessionData : null
  const heroName = username.trim() || 'Warrior'
  // Local calendar date, not UTC — `toISOString()` would drift a day off
  // (letting "tomorrow" be pickable, or blocking "today") for any timezone
  // ahead of/behind UTC around midnight.
  const now = new Date()
  const todayISO = formatBirthday(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const canSubmit = !loading && !loadingSession
    && !!username.trim() && !!firstName.trim() && !!lastName.trim() && !!birthday

  return (
    <div className="flex-1 w-full flex flex-col" style={{ position: 'fixed', inset: 0 }}>
      <PageHeader title="Setup Profile" onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col">

        {/* Hero */}
        <div className="relative flex flex-col justify-end overflow-hidden flex-shrink-0 w-full" style={{ height: 240, padding: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backgroundUrl ?? '/img/default_image.png'}
            alt=""
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--gradient-image-overlay)' }} />

          <div className="relative flex items-center w-full" style={{ gap: 16 }}>
            <UserAvatar avatarUrl={avatarUrl} username={heroName} size={56} bg="primary" priority />

            <div className="flex-1 min-w-0 flex flex-col justify-center leading-none">
              <p className="font-body font-bold truncate" style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
                {heroName}
              </p>
            </div>
          </div>
        </div>

        {/* Status ticker */}
        <TickerBanner text={status.trim() || 'Whats the mood today...'} />

        {/* Body */}
        <div className="flex flex-col w-full" style={{ gap: 20, paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16 }}>

          {error && <ErrorBox message={error} />}

          {loadingSession ? (
            <div className="py-6 flex justify-center">
              <span className="flex gap-1">
                <span className="inline-block w-1.5 h-1.5 animate-bounce" style={{ background: 'var(--color-purple)', animationDelay: '0ms' }} />
                <span className="inline-block w-1.5 h-1.5 animate-bounce" style={{ background: 'var(--color-purple)', animationDelay: '150ms' }} />
                <span className="inline-block w-1.5 h-1.5 animate-bounce" style={{ background: 'var(--color-purple)', animationDelay: '300ms' }} />
              </span>
            </div>
          ) : (
            <>
              {/* Profile Photo / Background Image upload targets */}
              <div className="flex w-full items-center" style={{ gap: 16 }}>
                <div className="flex flex-col flex-shrink-0" style={{ gap: 8 }}>
                  <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                    Profile Photo
                  </p>
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    className="flex items-center justify-center rounded-full border border-dashed border-border-hover overflow-hidden appearance-none active:opacity-70 transition-opacity"
                    style={{ width: 112, height: 112 }}
                    aria-label="Upload profile photo"
                  >
                    <Plus style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
                  </button>
                </div>

                <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
                  <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                    Background Image
                  </p>
                  <button
                    type="button"
                    onClick={() => bgFileInputRef.current?.click()}
                    className="flex items-center justify-center w-full border border-dashed border-border-hover overflow-hidden appearance-none active:opacity-70 transition-opacity"
                    style={{ height: 112 }}
                    aria-label="Upload background image"
                  >
                    <Plus style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <InputField
                label="Username"
                required
                value={username}
                onChange={(v) => setUsername(v.replace(/<[^>]*>/g, '').slice(0, 20))}
                placeholder="your display name"
                maxLength={20}
              />

              <InputField
                label="Mood"
                value={status}
                onChange={(v) => setStatus(v.slice(0, 100))}
                placeholder="Pop up in your city like a banksy"
                maxLength={100}
              />

              {/* Email Connected (read-only) */}
              <div className="flex flex-col w-full" style={{ gap: 8 }}>
                <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                  Email Connected
                </p>
                <div
                  className="w-full border h-[50px] flex items-center overflow-hidden"
                  style={{ borderColor: 'var(--color-border)', paddingLeft: 16, paddingRight: 16 }}
                >
                  <p className="font-body font-normal leading-normal truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', fontVariationSettings: '"opsz" 14' }}>
                    {sessionSnapshot?.email ?? ''}
                  </p>
                </div>
                <p className="font-body font-normal tracking-[0.2px] leading-normal w-full" style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14', color: 'var(--color-tertiary)' }}>
                  Emails are hidden from public view. Only you see it.
                </p>
              </div>

              <InputField
                label="First Name"
                required
                value={firstName}
                onChange={(v) => setFirstName(v.replace(/<[^>]*>/g, '').slice(0, 50))}
                placeholder="Alex"
                maxLength={50}
                autoComplete="given-name"
                helperText="Your name is hidden from public view. Only you see it."
              />

              <InputField
                label="Last Name"
                required
                value={lastName}
                onChange={(v) => setLastName(v.replace(/<[^>]*>/g, '').slice(0, 50))}
                placeholder="Mercer"
                maxLength={50}
                autoComplete="family-name"
                helperText="Your name is hidden from public view. Only you see it."
              />

              <InputField
                label="Birthday"
                required
                type="date"
                value={birthday}
                onChange={setBirthday}
                max={todayISO}
                helperText="Birthday is hidden from your profile. Groups you're in can only see them."
              />
            </>
          )}
        </div>

      </div>

      <PageFooter>
        <Button
          variant="filled"
          rounded
          labelFont="body"
          loading={loading}
          disabled={!canSubmit}
          className="w-full"
          onClick={handleCreateProfile}
        >
          Create Account
        </Button>
      </PageFooter>

      {/* Hidden avatar file input */}
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setPendingAvatarFile(f)
          e.target.value = ''
        }}
      />
      <AvatarUploadModal
        file={pendingAvatarFile}
        userId={sessionSnapshot?.userId ?? ''}
        isDev={false}
        onClose={() => setPendingAvatarFile(null)}
        onSuccess={(url) => { setAvatarUrl(url); setPendingAvatarFile(null) }}
      />

      {/* Hidden background file input */}
      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setPendingBgFile(f)
          e.target.value = ''
        }}
      />
      <BackgroundUploadModal
        file={pendingBgFile}
        userId={sessionSnapshot?.userId ?? ''}
        isDev={false}
        onClose={() => setPendingBgFile(null)}
        onSuccess={(url) => { setBackgroundUrl(url); setPendingBgFile(null) }}
      />
    </div>
  )
}
