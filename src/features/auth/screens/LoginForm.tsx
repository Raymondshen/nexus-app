'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Upload } from 'pixelarticons/react/Upload'
import { DiamondGem } from 'pixelarticons/react/DiamondGem'
import { TokeCircle } from 'pixelarticons/react/TokeCircle'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { InputField } from '@/shared/components/ui/InputField'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { PageFooter } from '@/shared/components/ui/PageFooter'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { AvatarUploadModal } from '@/shared/components/overlays/AvatarUploadModal'
import { BackgroundUploadModal } from '@/shared/components/overlays/BackgroundUploadModal'
import { signInWithGoogleForInvite, signInWithGoogle } from '@/shared/supabase/auth'
import {
  validateInviteCodeAction,
  checkReservedUserAction,
  reservePlaceAction,
  completeInviteFlowAction,
  reserveAfterGoogleAction,
  type CheckReservedResult,
} from '@/app/(auth)/login/actions'
import { validateSocialLinkFormat, buildSocialLink, PLATFORM_URL_PREFIX } from '@/shared/utils/socialLinks'
import type { AvatarClass } from '@/types'

const CLASSES: { id: AvatarClass; name: string; flavor: string; color: string }[] = [
  { id: 'mage',    name: 'MAGE',    flavor: 'Channel arcane fire. Knowledge is power.',          color: '#00e5ff' },
  { id: 'warrior', name: 'WARRIOR', flavor: 'First to fight. Last to fall.',                      color: '#ff4444' },
  { id: 'rogue',   name: 'ROGUE',   flavor: 'Strike from darkness. Always unseen.',               color: '#bf5fff' },
  { id: 'healer',  name: 'HEALER',  flavor: 'Keep the crew alive. Support wins wars.',            color: '#66bb6a' },
  { id: 'archer',  name: 'ARCHER',  flavor: 'Never misses. Strikes before the enemy blinks.',     color: '#ffd700' },
]

type Step =
  | 'landing'
  | 'invite-code'    // enter & validate invite code first
  | 'invite-oauth'   // google sign-in (after code validated)
  | 'invite-profile' // username + class (after oauth)
  | 'reserve-google'  // direct Google sign-in, no Nexus account yet (Figma 547:2452/2587)
  | 'reserve-email'
  | 'reserve-class'
  | 'reserve-name'
  | 'reserve-done'

function ClassCarousel({
  selected,
  onChange,
}: {
  selected: AvatarClass
  onChange: (cls: AvatarClass) => void
}) {
  const currentIndex = CLASSES.findIndex(c => c.id === selected)
  const cls = CLASSES[currentIndex] ?? CLASSES[0]

  function prev() {
    const idx = (currentIndex - 1 + CLASSES.length) % CLASSES.length
    onChange(CLASSES[idx].id)
  }

  function next() {
    const idx = (currentIndex + 1) % CLASSES.length
    onChange(CLASSES[idx].id)
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-pixel text-[9px] text-[#bf5fff] tracking-widest uppercase">Your Class</span>
      <div
        className="p-4 border-2 transition-colors"
        style={{
          borderColor: cls.color,
          background: `color-mix(in srgb, ${cls.color} 5%, #080514)`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous class"
            className="font-pixel text-[18px] text-[#6b4f8f] hover:text-white transition-colors w-8 text-center leading-none"
          >
            ‹
          </button>
          <span className="font-pixel text-[11px]" style={{ color: cls.color }}>
            {cls.name}
          </span>
          <button
            type="button"
            onClick={next}
            aria-label="Next class"
            className="font-pixel text-[18px] text-[#6b4f8f] hover:text-white transition-colors w-8 text-center leading-none"
          >
            ›
          </button>
        </div>
        <p className="font-pixel text-[7px] text-[#6b4f8f] text-center leading-relaxed">
          {cls.flavor}
        </p>
      </div>
      <div className="flex justify-center gap-2">
        {CLASSES.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            aria-label={`Select ${c.name}`}
            className="w-2 h-2 transition-colors"
            style={{ backgroundColor: i === currentIndex ? c.color : '#2a1545' }}
          />
        ))}
      </div>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-pixel text-[9px] text-[#6b4f8f] hover:text-[#bf5fff] transition-colors text-center w-full"
    >
      ← BACK
    </button>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2">
      <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{message}</p>
    </div>
  )
}

const variants = {
  enter:  { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0  },
  exit:   { opacity: 0, y: -6 },
}

export function LoginForm({
  flow,
  step: stepParam,
  urlError,
  code,
}: {
  flow?: string
  step?: string
  urlError?: string
  code?: string
}) {
  const router = useRouter()

  const [step, setStep] = useState<Step>(
    flow === 'invite' && stepParam === '2' ? 'invite-profile'
    : urlError === 'no_account' ? 'reserve-google'
    : 'landing'
  )
  const [email, setEmail]                 = useState('')
  const [username, setUsername]           = useState('')
  const [firstName, setFirstName]         = useState('')
  const [lastName, setLastName]           = useState('')
  const [selectedClass, setSelectedClass] = useState<AvatarClass>('mage')
  const [inviteCode, setInviteCode]       = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [loading, setLoading]             = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [signInLoading, setSignInLoading] = useState(false)
  const [reservedData, setReservedData]   = useState<CheckReservedResult | null>(null)
  const [loadingReserved, setLoadingReserved] = useState(false)
  const [doneUsername, setDoneUsername]   = useState('')
  const [doneClass, setDoneClass]         = useState('')

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

  // ── Reserve-after-Google step (Figma 547:2452/2587) ───────────────────────
  const [reservedSuccess, setReservedSuccess] = useState(false)

  // When reaching invite-profile or reserve-google, fetch the session snapshot
  // (email/coins/gems/avatar) and any existing reservation. The auto-complete
  // branch below only fires when `code` is set, which never happens on the
  // reserve-google entry path (no invite flow cookie) — safe to share.
  useEffect(() => {
    if (step !== 'invite-profile' && step !== 'reserve-google') return
    let cancelled = false
    setLoadingReserved(true)

    checkReservedUserAction().then(async result => {
      if (cancelled) return
      setReservedData(result)
      if (result.hasSession) setAvatarUrl(result.avatarUrl)

      if (result.found) {
        setUsername(result.data.username)
        const cls = result.data.class as AvatarClass | null
        if (cls) setSelectedClass(cls)

        // Reserved user has username + class from the waitlist — skip the form
        // and complete the invite flow automatically.
        if (cls && code) {
          try {
            const completion = await completeInviteFlowAction(code, result.data.username, cls)
            if (cancelled) return
            if (completion.success) {
              router.push('/home')
              return  // leave spinner up during navigation
            }
            setError(completion.error ?? 'The rift destabilized. Try again.')
          } catch {
            if (!cancelled) setError('The rift destabilized. Try again.')
          }
        }
      } else if (!result.hasSession) {
        if (!cancelled) {
          setStep('invite-oauth')
          setError('Sign in with Google first, then enter your invite code.')
        }
      }

      if (!cancelled) setLoadingReserved(false)
    })

    return () => { cancelled = true }
  }, [step])

  async function handleValidateCode() {
    setError(null)
    setLoading(true)
    try {
      const result = await validateInviteCodeAction(inviteCode)
      if (result.valid) {
        setStep('invite-oauth')
      } else {
        setError(result.error ?? 'The Nexus does not recognize this code.')
      }
    } catch {
      setError('The rift destabilized. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleInviteOAuth() {
    setError(null)
    setGoogleLoading(true)
    try {
      // Persist the validated code across the OAuth redirect via a short-lived cookie
      document.cookie = `nexus_invite_code=${encodeURIComponent(inviteCode)}; path=/; SameSite=Lax; max-age=300`
      await signInWithGoogleForInvite()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to Google.')
      setGoogleLoading(false)
    }
  }

  async function handleCompleteInvite() {
    if (!code) {
      setError('Session expired. Please start over.')
      return
    }
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
      const result = await completeInviteFlowAction(code, username, selectedClass, firstName, lastName, {
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

  async function handleReserveGoogle() {
    if (reservedSuccess) return
    setError(null)
    setLoading(true)
    try {
      const result = await reserveAfterGoogleAction(username, inviteCode)
      if (!result.success) {
        setError(result.error ?? 'The rift destabilized. Try again.')
        return
      }
      if (result.reserved) {
        setReservedSuccess(true)
      } else {
        // A valid invite code was entered — registration completed immediately.
        router.push('/home')
      }
    } catch {
      setError('The rift destabilized. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleReserveEmailContinue() {
    const emailClean = email.trim().toLowerCase()
    if (!emailClean.endsWith('@gmail.com')) {
      setError('Gmail only. Your class and name will be held until your invite arrives.')
      return
    }
    setError(null)
    setStep('reserve-class')
  }

  async function handleReserveSubmit() {
    if (!firstName.trim()) { setError('First name is required.'); return }
    if (!lastName.trim())  { setError('Last name is required.');  return }
    setError(null)
    setLoading(true)
    try {
      const result = await reservePlaceAction(email, username, selectedClass, firstName, lastName)
      if (result.success) {
        setDoneUsername(username)
        setDoneClass(CLASSES.find(c => c.id === selectedClass)?.name ?? selectedClass)
        setStep('reserve-done')
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
    switch (step) {
      case 'invite-code':    setStep('landing');       break
      case 'invite-oauth':
        setStep('landing')
        setInviteCode('')
        break
      case 'invite-profile': setStep('landing');       break
      case 'reserve-google':
        setStep('landing')
        setUsername('')
        setInviteCode('')
        setReservedSuccess(false)
        break
      case 'reserve-email':  setStep('landing');       break
      case 'reserve-class':  setStep('reserve-email'); break
      case 'reserve-name':   setStep('reserve-class'); break
      case 'reserve-done':
        setStep('landing')
        setEmail('')
        setUsername('')
        setSelectedClass('mage')
        break
    }
  }

  const isReserved = reservedData?.found === true

  // ── Landing (Figma 544:2786) ────────────────────────────────────────────
  // Full-bleed screen, no boxed card — replaces the old "ENTER THE NEXUS"
  // step. Only Google sign-in + the invite-code entry point remain; the
  // waitlist ("reserve my place") steps below are no longer reachable from
  // here but are kept rather than deleted, matching this codebase's existing
  // orphaned-but-valid-code convention (see CLAUDE.md → Manage Profile /
  // Developer Settings). Sign-in success/failure (existing account vs. no
  // account found) is decided server-side in /auth/callback, which already
  // redirects back here with ?error=no_account when no profile exists.
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

          <div className="flex flex-col items-start w-full" style={{ gap: 'var(--x2)' }}>
            <Button
              type="button"
              variant="outlined"
              color="purple"
              className="w-full"
              onClick={() => { setError(null); setStep('invite-code') }}
            >
              I HAVE AN INVITE CODE
            </Button>
            <p
              className="font-body font-light text-tertiary w-full leading-[1.4]"
              style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}
            >
              Nexus is invite-only. Got a code from your squad?
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Reserve after Google sign-in (Figma 547:2452 / 547:2587) ─────────────
  // "SIGN IN WITH GOOGLE" (no invite code) succeeded, but this Google account
  // has no Nexus profile yet — /auth/callback redirects here with
  // ?error=no_account. The user is already authenticated; this screen lets
  // them reserve a display name against that account (or, if they happen to
  // have an invite code, complete registration immediately via the same
  // field).
  if (step === 'reserve-google') {
    const sessionSnapshot = reservedData && reservedData.hasSession ? reservedData : null

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
            Unfortunately no account exists for that google account. You may reserve this account and display name until you receive a code. Code invites are only possible through sending a request to the dev&rsquo;s or existing users of Nexus.
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

          <InputField
            label="Account"
            disabled
            value={sessionSnapshot?.email ?? ''}
            onChange={() => {}}
          />

          <InputField
            label="Display Name"
            required
            disabled={reservedSuccess}
            value={username}
            onChange={(v) => setUsername(v.replace(/<[^>]*>/g, '').slice(0, 20))}
            placeholder="your display name"
            maxLength={20}
          />

          <InputField
            label="Enter Invite Code"
            disabled={reservedSuccess}
            value={inviteCode}
            onChange={(v) => setInviteCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
            placeholder="ABCDEF"
            helperText="Enter the personal invite code given to you."
            autoComplete="off"
            autoCapitalize="characters"
          />

          <Button
            type="button"
            variant="filled"
            color={reservedSuccess ? 'green' : undefined}
            loading={loading}
            disabled={loading || !username.trim()}
            className="w-full"
            onClick={handleReserveGoogle}
          >
            {reservedSuccess ? 'RESERVED' : 'RESERVE MY NAME'}
          </Button>

          <Button
            type="button"
            variant="outlined"
            color="tertiary"
            className="w-full"
            onClick={goBack}
          >
            BACK HOME
          </Button>
        </div>
      </div>
    )
  }

  // ── Invite — Code entry (Figma 545:5713) ────────────────────────────────
  // Full-bleed screen matching the landing step's layout — no boxed card.
  // Validation runs on Enter (form submit) via handleValidateCode; Cancel
  // creation routes back to the landing step (Google sign-in / invite-code
  // entry point).
  if (step === 'invite-code') {
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
            Let&rsquo;s create your account
          </p>
        </div>

        <form
          className="flex flex-col items-start w-full"
          style={{ gap: 'var(--x5)' }}
          onSubmit={e => { e.preventDefault(); handleValidateCode() }}
        >
          {error && (
            <p
              className="font-body font-normal text-center w-full leading-relaxed"
              style={{ fontSize: 'var(--xs)', color: 'var(--red)', fontVariationSettings: '"opsz" 14' }}
            >
              {error}
            </p>
          )}

          <InputField
            label="Enter Invite Code"
            required
            value={inviteCode}
            onChange={v => setInviteCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
            placeholder="ABCDEF"
            helperText="Enter the personal invite code given to you."
            autoComplete="off"
            autoCapitalize="characters"
          />

          <Button
            type="submit"
            variant="filled"
            loading={loading}
            disabled={loading || !inviteCode.trim()}
            className="w-full"
          >
            ENTER
          </Button>

          <Button
            type="button"
            variant="outlined"
            color="tertiary"
            className="w-full"
            onClick={goBack}
          >
            CANCEL CREATION
          </Button>
        </form>
      </div>
    )
  }

  // ── Invite — OAuth (Figma 546:2052) ──────────────────────────────────────
  // Full-bleed screen matching the landing/invite-code layout. Cancel
  // creation returns straight to the landing step (goBack resets step +
  // inviteCode), not back to the code-entry step.
  if (step === 'invite-oauth') {
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
            Welcome! Invite code was valid. Sign in with google to create your account.
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
            loading={googleLoading}
            disabled={googleLoading}
            className="w-full"
            onClick={handleInviteOAuth}
          >
            SIGN IN WITH GOOGLE
          </Button>

          <Button
            type="button"
            variant="outlined"
            color="tertiary"
            className="w-full"
            onClick={goBack}
          >
            CANCEL CREATION
          </Button>
        </div>
      </div>
    )
  }

  // ── Create Profile (Figma 547:2289) ──────────────────────────────────────
  // Final step of the invite signup flow — modeled directly on
  // ManageUserProfile.tsx (same hero/upload/field patterns) rather than a new
  // layout. Reserved users with a class on file never see this screen (the
  // effect above auto-completes and navigates to /home first); a reserved
  // user without a class still lands here with Display Name locked.
  if (step === 'invite-profile') {
    const sessionSnapshot = reservedData && reservedData.hasSession ? reservedData : null
    const heroName = username.trim() || 'Warrior'
    const canSubmit = !loading && !loadingReserved && !!code
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
            {!code && !loadingReserved && <ErrorBox message="Session expired. Please start over." />}

            {loadingReserved ? (
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
                  disabled={isReserved}
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
            onClick={handleCompleteInvite}
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

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[390px]">

        {/* Nexus logo */}
        <div className="text-center mb-8">
          <h1
            className="font-pixel text-3xl text-[#bf5fff] tracking-wider mb-3"
            style={{
              textShadow: '0 0 30px rgba(191,95,255,0.9), 0 0 60px rgba(191,95,255,0.4)',
            }}
          >
            NEXUS
          </h1>
          <p className="font-pixel text-[8px] text-[#00e5ff] tracking-[0.4em]">
            YOUR CREW. YOUR WAR.
          </p>
        </div>

        {/* Auth card */}
        <div
          className="bg-[#0f0820] border-2 border-[#bf5fff]/40 p-6"
          style={{
            boxShadow:
              '0 0 40px rgba(191,95,255,0.12), 0 0 80px rgba(191,95,255,0.06), inset 0 1px 0 rgba(191,95,255,0.08)',
          }}
        >
          <AnimatePresence mode="wait">

      {/* ── Reserve — Email step ─────────────────────────────────────────────── */}
      {step === 'reserve-email' && (
        <motion.div
          key="reserve-email"
          variants={variants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.18 }}
          className="flex flex-col gap-4"
        >
          <div className="text-center">
            <h2 className="font-pixel text-[11px] text-white mb-1">RESERVE YOUR PLACE</h2>
          </div>

          {error && <ErrorBox message={error} />}

          <div className="flex flex-col gap-1">
            <Input
              name="email"
              type="email"
              label="GMAIL ADDRESS"
              placeholder="warrior@gmail.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
            <p className="font-pixel text-[8px] text-[#3d2660] leading-relaxed mt-1">
              Gmail only. Your class and name will be held until your invite arrives.
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            disabled={!email.trim()}
            className="w-full"
            onClick={handleReserveEmailContinue}
          >
            CONTINUE
          </Button>

          <BackButton onClick={goBack} />
        </motion.div>
      )}

      {/* ── Reserve — Class step ─────────────────────────────────────────────── */}
      {step === 'reserve-class' && (
        <motion.div
          key="reserve-class"
          variants={variants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.18 }}
          className="flex flex-col gap-5"
        >
          <div className="text-center">
            <h2 className="font-pixel text-[11px] text-white mb-1">CHOOSE YOUR CLASS</h2>
            <p className="font-pixel text-[8px] text-[#6b4f8f]">Your legend begins here.</p>
          </div>

          <ClassCarousel selected={selectedClass} onChange={setSelectedClass} />

          <Button
            type="button"
            variant="primary"
            className="w-full"
            onClick={() => { setError(null); setStep('reserve-name') }}
          >
            CONTINUE
          </Button>

          <BackButton onClick={goBack} />
        </motion.div>
      )}

      {/* ── Reserve — Name step ──────────────────────────────────────────────── */}
      {step === 'reserve-name' && (
        <motion.div
          key="reserve-name"
          variants={variants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.18 }}
          className="flex flex-col gap-4"
        >
          <div className="text-center">
            <h2 className="font-pixel text-[11px] text-white mb-1">YOUR WARRIOR NAME</h2>
          </div>

          {error && <ErrorBox message={error} />}

          <div className="flex gap-3">
            <Input
              name="firstName"
              type="text"
              label="FIRST NAME"
              placeholder="Alex"
              value={firstName}
              onChange={e => setFirstName(e.target.value.replace(/<[^>]*>/g, '').slice(0, 50))}
              maxLength={50}
              autoComplete="given-name"
            />
            <Input
              name="lastName"
              type="text"
              label="LAST NAME"
              placeholder="Mercer"
              value={lastName}
              onChange={e => setLastName(e.target.value.replace(/<[^>]*>/g, '').slice(0, 50))}
              maxLength={50}
              autoComplete="family-name"
            />
          </div>

          <Input
            name="username"
            type="text"
            label="WARRIOR NAME"
            placeholder="ShadowBlade99"
            value={username}
            onChange={e => setUsername(e.target.value.replace(/<[^>]*>/g, '').slice(0, 20))}
            maxLength={20}
            autoComplete="off"
          />

          <Button
            type="button"
            variant="primary"
            loading={loading}
            disabled={loading || username.trim().length < 3 || !firstName.trim() || !lastName.trim()}
            className="w-full"
            onClick={handleReserveSubmit}
          >
            RESERVE MY PLACE
          </Button>

          <BackButton onClick={goBack} />
        </motion.div>
      )}

      {/* ── Reserve — Done ───────────────────────────────────────────────────── */}
      {step === 'reserve-done' && (
        <motion.div
          key="reserve-done"
          variants={variants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.18 }}
          className="flex flex-col items-center gap-6 text-center"
        >
          <div
            className="w-12 h-12 border-2 border-[#bf5fff] flex items-center justify-center"
            style={{ boxShadow: '0 0 20px rgba(191,95,255,0.4)' }}
          >
            <span className="font-pixel text-[16px] text-[#bf5fff]">✓</span>
          </div>

          <div className="flex flex-col gap-2">
            <p className="font-pixel text-[9px] text-white leading-relaxed">
              <span className="text-[#bf5fff]">{doneUsername}</span>
              {' '}the{' '}
              <span className="text-[#bf5fff]">{doneClass}</span>
              {' '}has been marked.
            </p>
            <p className="font-pixel text-[8px] text-[#6b4f8f] leading-relaxed">
              When your invite arrives, your place is waiting.
            </p>
          </div>

          <button
            type="button"
            onClick={goBack}
            className="font-pixel text-[9px] text-[#6b4f8f] hover:text-[#bf5fff] transition-colors"
          >
            ← BACK TO START
          </button>
        </motion.div>
      )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
