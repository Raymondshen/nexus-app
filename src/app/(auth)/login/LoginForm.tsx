'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { signInWithGoogle, signInWithGoogleForInvite } from '@/lib/supabase/auth'
import {
  checkReservedUserAction,
  reservePlaceAction,
  completeInviteFlowAction,
  type CheckReservedResult,
} from './actions'
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
  | 'invite-oauth'
  | 'invite-profile'
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

function GoogleButton({
  onClick,
  loading,
}: {
  onClick: () => void
  loading: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 bg-[#1a1a2e] hover:bg-[#252540] border border-[#3a3a5c] text-white font-pixel text-[11px] tracking-wider px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[3px_3px_0px_#0d0d1a] active:shadow-none active:translate-y-[2px]"
    >
      {loading ? (
        <span className="flex gap-1">
          <span className="inline-block w-1 h-1 bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="inline-block w-1 h-1 bg-white animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="inline-block w-1 h-1 bg-white animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          CONTINUE WITH GOOGLE
        </>
      )}
    </button>
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
}: {
  flow?: string
  step?: string
}) {
  const router = useRouter()

  const [step, setStep] = useState<Step>(
    flow === 'invite' && stepParam === '2' ? 'invite-profile' : 'landing'
  )
  const [email, setEmail]               = useState('')
  const [username, setUsername]         = useState('')
  const [selectedClass, setSelectedClass] = useState<AvatarClass>('mage')
  const [inviteCode, setInviteCode]     = useState('')
  const [error, setError]               = useState<string | null>(null)
  const [loading, setLoading]           = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [signInLoading, setSignInLoading] = useState(false)
  const [reservedData, setReservedData] = useState<CheckReservedResult | null>(null)
  const [loadingReserved, setLoadingReserved] = useState(false)
  const [doneUsername, setDoneUsername] = useState('')
  const [doneClass, setDoneClass]       = useState('')

  // When reaching invite-profile, check if user has a reservation or a valid session
  useEffect(() => {
    if (step !== 'invite-profile') return
    setLoadingReserved(true)
    checkReservedUserAction().then(result => {
      setReservedData(result)
      if (result.found) {
        setUsername(result.data.username)
        if (result.data.class) setSelectedClass(result.data.class as AvatarClass)
      } else if (!result.hasSession) {
        // No Supabase session — bounce back to OAuth step
        setStep('invite-oauth')
        setError('Sign in with Google first, then enter your invite code.')
      }
      setLoadingReserved(false)
    })
  }, [step])

  async function handleInviteOAuth() {
    setError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogleForInvite()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to Google.')
      setGoogleLoading(false)
    }
  }

  async function handleCompleteInvite() {
    setError(null)
    setLoading(true)
    try {
      const result = await completeInviteFlowAction(inviteCode, username, selectedClass)
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
    setError(null)
    setLoading(true)
    try {
      const result = await reservePlaceAction(email, username, selectedClass)
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
      case 'invite-oauth':    setStep('landing');        break
      case 'invite-profile':  setStep('landing');        break
      case 'reserve-email':   setStep('landing');        break
      case 'reserve-class':   setStep('reserve-email');  break
      case 'reserve-name':    setStep('reserve-class');  break
      case 'reserve-done':
        setStep('landing')
        setEmail('')
        setUsername('')
        setSelectedClass('mage')
        break
    }
  }

  const isReserved = reservedData?.found === true

  return (
    <AnimatePresence mode="wait">

      {/* ── Landing ─────────────────────────────────────────────────────────── */}
      {step === 'landing' && (
        <motion.div
          key="landing"
          variants={variants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.18 }}
          className="flex flex-col gap-5"
        >
          <div className="text-center">
            <h2 className="font-pixel text-sm text-white mb-3">ENTER THE NEXUS</h2>
            <p className="font-pixel text-[8px] text-[#6b4f8f] leading-relaxed">
              Nexus is invite only. Enter with a code or claim your name before the gates open.
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            className="w-full"
            onClick={() => { setError(null); setStep('invite-oauth') }}
          >
            I HAVE AN INVITE CODE
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => { setError(null); setStep('reserve-email') }}
          >
            RESERVE MY PLACE
          </Button>

          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1 border-t border-[#2a1545]" />
            <span className="font-pixel text-[8px] text-[#3d2660]">ALREADY A MEMBER</span>
            <div className="flex-1 border-t border-[#2a1545]" />
          </div>

          <button
            type="button"
            disabled={signInLoading}
            onClick={async () => {
              setSignInLoading(true)
              try { await signInWithGoogle() } catch { setSignInLoading(false) }
            }}
            className="w-full flex items-center justify-center gap-3 bg-transparent border border-[#2a1545] hover:border-[#3a3a5c] text-[#6b4f8f] hover:text-white font-pixel text-[10px] tracking-wider px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signInLoading ? (
              <span className="flex gap-1">
                <span className="inline-block w-1 h-1 bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="inline-block w-1 h-1 bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="inline-block w-1 h-1 bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                SIGN IN WITH GOOGLE
              </>
            )}
          </button>
        </motion.div>
      )}

      {/* ── Invite — OAuth step ──────────────────────────────────────────────── */}
      {step === 'invite-oauth' && (
        <motion.div
          key="invite-oauth"
          variants={variants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.18 }}
          className="flex flex-col gap-5"
        >
          <div className="text-center">
            <h2 className="font-pixel text-[11px] text-white mb-2">CONNECT YOUR GMAIL</h2>
            <p className="font-pixel text-[8px] text-[#6b4f8f] leading-relaxed">
              We&apos;ll verify your invite code after sign-in.
            </p>
          </div>

          {error && <ErrorBox message={error} />}

          <GoogleButton onClick={handleInviteOAuth} loading={googleLoading} />
          <BackButton onClick={goBack} />
        </motion.div>
      )}

      {/* ── Invite — Profile + code step ────────────────────────────────────── */}
      {step === 'invite-profile' && (
        <motion.div
          key="invite-profile"
          variants={variants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.18 }}
          className="flex flex-col gap-4"
        >
          <div className="text-center">
            <h2 className="font-pixel text-[11px] text-white mb-1">ENTER THE NEXUS</h2>
          </div>

          {error && <ErrorBox message={error} />}

          {loadingReserved ? (
            <div className="py-6 flex justify-center">
              <span className="flex gap-1">
                <span className="inline-block w-1.5 h-1.5 bg-[#bf5fff] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="inline-block w-1.5 h-1.5 bg-[#bf5fff] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="inline-block w-1.5 h-1.5 bg-[#bf5fff] animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          ) : isReserved ? (
            /* Reserved user — read-only pre-filled fields */
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-[6px]">
                <span className="font-pixel text-[9px] text-[#bf5fff] tracking-widest uppercase">
                  Warrior Name
                </span>
                <div className="bg-[#080514] border-2 border-[#2a1545] px-3 py-3">
                  <span className="text-white text-sm font-sans">{username}</span>
                </div>
              </div>
              {selectedClass && (
                <div className="flex flex-col gap-[6px]">
                  <span className="font-pixel text-[9px] text-[#bf5fff] tracking-widest uppercase">
                    Your Class
                  </span>
                  <div
                    className="border-2 px-3 py-2"
                    style={{
                      borderColor: CLASSES.find(c => c.id === selectedClass)?.color ?? '#2a1545',
                      background: '#080514',
                    }}
                  >
                    <span
                      className="font-pixel text-[10px]"
                      style={{ color: CLASSES.find(c => c.id === selectedClass)?.color }}
                    >
                      {CLASSES.find(c => c.id === selectedClass)?.name}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Non-reserved user — interactive fields */
            <div className="flex flex-col gap-4">
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
              <ClassCarousel selected={selectedClass} onChange={setSelectedClass} />
            </div>
          )}

          {!loadingReserved && (
            <>
              <Input
                name="inviteCode"
                type="text"
                label="INVITE CODE"
                placeholder="ENTER CODE"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase().slice(0, 10))}
                autoComplete="off"
                autoCapitalize="characters"
              />

              <Button
                type="button"
                variant="primary"
                loading={loading}
                disabled={loading || !inviteCode.trim() || !username.trim()}
                className="w-full"
                onClick={handleCompleteInvite}
              >
                ENTER THE NEXUS
              </Button>

              <BackButton onClick={goBack} />
            </>
          )}
        </motion.div>
      )}

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
            disabled={loading || username.trim().length < 3}
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
  )
}
