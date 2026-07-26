'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'pixelarticons/react/Upload'
import { DiamondGem } from 'pixelarticons/react/DiamondGem'
import { TokeCircle } from 'pixelarticons/react/TokeCircle'
import { Button } from '@/shared/components/ui/Button'
import { InputField } from '@/shared/components/ui/InputField'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { PageFooter } from '@/shared/components/ui/PageFooter'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { AvatarUploadModal } from '@/shared/components/overlays/AvatarUploadModal'
import { BackgroundUploadModal } from '@/shared/components/overlays/BackgroundUploadModal'
import { signInWithGoogle } from '@/shared/supabase/auth'
import {
  getSignupSessionAction,
  completeSignupAction,
  type SignupSessionResult,
} from '@/app/(auth)/login/actions'
import { validateSocialLinkFormat, buildSocialLink, PLATFORM_URL_PREFIX } from '@/shared/utils/socialLinks'
import type { AvatarClass } from '@/types'

type Step =
  | 'landing'
  | 'create-profile' // display name + class + profile details (after Google oauth)

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2">
      <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{message}</p>
    </div>
  )
}

export function LoginForm({
  newAccount,
}: {
  newAccount?: string
}) {
  const router = useRouter()

  const [step, setStep] = useState<Step>(
    newAccount === '1' ? 'create-profile' : 'landing'
  )
  const [username, setUsername]           = useState('')
  const [firstName, setFirstName]         = useState('')
  const [lastName, setLastName]           = useState('')
  const [selectedClass]                   = useState<AvatarClass>('mage')
  const [error, setError]                 = useState<string | null>(null)
  const [loading, setLoading]             = useState(false)
  const [signInLoading, setSignInLoading] = useState(false)
  const [sessionData, setSessionData]     = useState<SignupSessionResult | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)

  // ── Create Profile step (Figma 547:2289) ──────────────────────────────────
  const [status,         setStatus]         = useState('')
  // Instagram/X/Reddit/LinkedIn store only the handle typed after the fixed URL
  // prefix (Figma 470:5509) — there's no saved value to derive from here, unlike
  // ManageUserProfile, since this is always a brand-new profile.
  const [instagramHandle, setInstagramHandle] = useState('')
  const [xHandle,          setXHandle]         = useState('')
  const [redditHandle,     setRedditHandle]    = useState('')
  const [linkedinHandle,   setLinkedinHandle]  = useState('')
  const [customSiteUrl,  setCustomSiteUrl]  = useState('')
  const [avatarUrl,      setAvatarUrl]      = useState<string | null>(null)
  const [backgroundUrl,  setBackgroundUrl]  = useState<string | null>(null)
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [pendingBgFile,     setPendingBgFile]     = useState<File | null>(null)
  const avatarFileInputRef = useRef<HTMLInputElement>(null)
  const bgFileInputRef     = useRef<HTMLInputElement>(null)

  // On reaching create-profile, fetch the session snapshot (email/coins/gems/
  // avatar) for the hero preview. If somehow no session exists (e.g. a direct
  // link to ?newAccount=1 with no active Google session), bounce back to landing.
  useEffect(() => {
    if (step !== 'create-profile') return
    let cancelled = false
    // Genuine data fetching keyed on `step` (React's own "you might not need an
    // effect" guide lists this as one of the two legitimate uses), not a
    // state-mirroring anti-pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingSession(true)

    getSignupSessionAction().then(result => {
      if (cancelled) return
      setSessionData(result)
      if (result.hasSession) {
        setAvatarUrl(result.avatarUrl)
      } else {
        setStep('landing')
        setError('Please sign in again.')
      }
      setLoadingSession(false)
    })

    return () => { cancelled = true }
  }, [step])

  async function handleCreateProfile() {
    if (!firstName.trim()) { setError('First name is required.'); return }
    if (!lastName.trim())  { setError('Last name is required.');  return }
    const instagramUrl = buildSocialLink('instagram', instagramHandle)
    const xUrl         = buildSocialLink('x', xHandle)
    const redditUrl    = buildSocialLink('reddit', redditHandle)
    const linkedinUrl  = buildSocialLink('linkedin', linkedinHandle)
    const socialLinkError =
      validateSocialLinkFormat('instagram', instagramUrl) ??
      validateSocialLinkFormat('x',         xUrl) ??
      validateSocialLinkFormat('reddit',    redditUrl) ??
      validateSocialLinkFormat('linkedin',  linkedinUrl)
    if (socialLinkError) { setError(socialLinkError); return }
    setError(null)
    setLoading(true)
    try {
      const result = await completeSignupAction(username, selectedClass, firstName, lastName, {
        status,
        instagramUrl,
        xUrl,
        redditUrl,
        linkedinUrl,
        customSiteUrl,
      })
      if (result.success) {
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

  function goBack() {
    setError(null)
    setStep('landing')
  }

  // ── Landing (Figma 544:2786) ────────────────────────────────────────────
  // Full-bleed screen, no boxed card. Signup is public: the only entry point
  // is Google sign-in. A new Google account (no Nexus profile yet) is routed
  // straight to the create-profile step server-side by /auth/callback
  // (?newAccount=1).
  if (step === 'landing') {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center w-full"
        style={{
          gap: 'var(--x6)',
          paddingLeft: 'var(--x5)',
          paddingRight: 'var(--x5)',
          paddingTop: 'max(env(safe-area-inset-top), var(--x5))',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--x5))',
        }}
      >
        <div className="flex flex-col items-center w-full" style={{ gap: 'var(--x3)' }}>
          <h1
            className="font-pixel text-primary text-center leading-none tracking-[0.2px]"
            style={{ fontSize: 'var(--display)' }}
          >
            NEXUS
          </h1>
          <p
            className="font-body font-normal text-secondary text-center w-full leading-[1.5]"
            style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
          >
            Nexus turns everyday conversations with your squad into shared challenges and rewards.
          </p>
        </div>

        <div className="flex flex-col items-start w-full" style={{ gap: 'var(--x5)' }}>
          {error && (
            <p
              className="font-body font-normal text-center w-full leading-relaxed"
              style={{ fontSize: 'var(--xs)', color: 'var(--red)', fontVariationSettings: '"opsz" 14' }}
            >
              {error}
            </p>
          )}

          <Button
            type="button"
            variant="filled"
            loading={signInLoading}
            disabled={signInLoading}
            className="w-full"
            onClick={async () => {
              setError(null)
              setSignInLoading(true)
              try { await signInWithGoogle() } catch { setSignInLoading(false) }
            }}
          >
            SIGN IN WITH GOOGLE
          </Button>
        </div>
      </div>
    )
  }

  // ── Create Profile (Figma 547:2289) ──────────────────────────────────────
  // Landed here after a fresh Google sign-in with no Nexus profile yet —
  // modeled directly on ManageUserProfile.tsx (same hero/upload/field
  // patterns) rather than a new layout.
  const sessionSnapshot = sessionData && sessionData.hasSession ? sessionData : null
  const heroName = username.trim() || 'Warrior'
  const canSubmit = !loading && !loadingSession
    && !!username.trim() && !!firstName.trim() && !!lastName.trim()

  return (
    <div className="flex-1 w-full flex flex-col" style={{ position: 'fixed', inset: 0 }}>
      <PageHeader title="Create Profile" onBack={goBack} />

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

            <div className="flex-1 min-w-0 flex flex-col justify-center leading-none" style={{ gap: 4 }}>
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                Lifetime msg. 0
              </p>
              <p className="font-body font-bold truncate" style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
                {heroName}
              </p>

              <div className="flex items-center" style={{ gap: 8 }}>
                <div className="flex items-center" style={{ gap: 4 }}>
                  <DiamondGem style={{ width: 12, height: 12, color: 'var(--color-purple)' }} aria-hidden="true" />
                  <span
                    className="font-silkscreen leading-none"
                    style={{
                      fontSize:             'var(--text-xxs)',
                      background:           'linear-gradient(to right, var(--color-purple), #d946ef)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor:  'transparent',
                      backgroundClip:       'text',
                    }}
                  >
                    {sessionSnapshot?.gemBalance ?? 0}
                  </span>
                </div>
                <div className="w-[2px] h-[2px] bg-border-hover flex-shrink-0" aria-hidden="true" />
                <div className="flex items-center" style={{ gap: 4 }}>
                  <TokeCircle style={{ width: 12, height: 12, color: 'var(--color-coins)' }} aria-hidden="true" />
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-coins)' }}>
                    {(sessionSnapshot?.coins ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
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
                <span className="inline-block w-1.5 h-1.5 bg-[#bf5fff] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="inline-block w-1.5 h-1.5 bg-[#bf5fff] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="inline-block w-1.5 h-1.5 bg-[#bf5fff] animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          ) : (
            <>
              {/* Account (read-only) */}
              <div className="flex flex-col w-full" style={{ gap: 8 }}>
                <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                  Account
                </p>
                <div
                  className="w-full border h-[50px] flex items-center overflow-hidden"
                  style={{ borderColor: 'var(--color-border-hover)', paddingLeft: 16, paddingRight: 16 }}
                >
                  <p className="font-body font-normal leading-normal truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}>
                    {sessionSnapshot?.email ?? ''}
                  </p>
                </div>
              </div>

              {/* Profile Photo / Background Image upload buttons */}
              <div className="flex w-full" style={{ gap: 16 }}>
                <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
                  <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                    Profile Photo
                  </p>
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    className="flex items-center justify-center w-full h-12 border border-[var(--color-purple)] active:opacity-70 transition-opacity"
                    style={{ gap: 8 }}
                  >
                    <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                    <span className="font-silkscreen leading-none pb-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}>
                      Upload
                    </span>
                  </button>
                </div>

                <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
                  <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                    Background Image
                  </p>
                  <button
                    type="button"
                    onClick={() => bgFileInputRef.current?.click()}
                    className="flex items-center justify-center w-full h-12 border border-[var(--color-purple)] active:opacity-70 transition-opacity"
                    style={{ gap: 8 }}
                  >
                    <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                    <span className="font-silkscreen leading-none pb-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}>
                      Upload
                    </span>
                  </button>
                </div>
              </div>

              <InputField
                label="Display Name"
                required
                value={username}
                onChange={(v) => setUsername(v.replace(/<[^>]*>/g, '').slice(0, 20))}
                placeholder="your display name"
                maxLength={20}
              />

              <div className="flex w-full" style={{ gap: 16 }}>
                <InputField
                  label="First Name"
                  required
                  value={firstName}
                  onChange={(v) => setFirstName(v.replace(/<[^>]*>/g, '').slice(0, 50))}
                  placeholder="Alex"
                  maxLength={50}
                  autoComplete="given-name"
                />
                <InputField
                  label="Last Name"
                  required
                  value={lastName}
                  onChange={(v) => setLastName(v.replace(/<[^>]*>/g, '').slice(0, 50))}
                  placeholder="Mercer"
                  maxLength={50}
                  autoComplete="family-name"
                />
              </div>

              <InputField
                label="Current Mood"
                value={status}
                onChange={(v) => setStatus(v.slice(0, 100))}
                placeholder="Pop up in your city like a banksy"
                helperText="Express yourself to your groups."
                maxLength={100}
              />

              <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}>
                Social Links
              </p>

              <InputField label="Instagram"    value={instagramHandle} onChange={setInstagramHandle} prefix={PLATFORM_URL_PREFIX.instagram} placeholder="your_username" maxLength={30}  autoComplete="off" />
              <InputField label="X"            value={xHandle}         onChange={setXHandle}         prefix={PLATFORM_URL_PREFIX.x}          placeholder="your_username" maxLength={15}  autoComplete="off" />
              <InputField label="Reddit"       value={redditHandle}    onChange={setRedditHandle}    prefix={PLATFORM_URL_PREFIX.reddit}     placeholder="your_username" maxLength={20}  autoComplete="off" />
              <InputField label="Linkedin"     value={linkedinHandle}  onChange={setLinkedinHandle}  prefix={PLATFORM_URL_PREFIX.linkedin}   placeholder="your_username" maxLength={100} autoComplete="off" />
              <InputField label="Custom Site"  value={customSiteUrl}   onChange={setCustomSiteUrl}   placeholder="yourwebsite.com" maxLength={200} autoComplete="off" />
            </>
          )}
        </div>

      </div>

      <PageFooter>
        <Button
          variant="filled"
          loading={loading}
          disabled={!canSubmit}
          className="w-full"
          onClick={handleCreateProfile}
        >
          CREATE PROFILE
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
