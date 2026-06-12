'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STORAGE_KEY   = 'nexus_install_prompted'
const FIRST_MSG_KEY = 'nexus_first_message'
const DELAY_MS      = 10_000

// Capture beforeinstallprompt even if it fires before this component mounts.
// The component useEffect also listens and will pick it up via _earlyPrompt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _earlyPrompt: any = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    _earlyPrompt = e
  })
}

type Platform = 'ios' | 'android' | 'none'

const IOS_STEPS = [
  'Tap the Share icon at the bottom of the screen',
  'Scroll down in the Share menu',
  'Tap "Add to Home Screen"',
  'Tap "Add" in the top right to confirm',
]

export function InstallPrompt() {
  const [visible,  setVisible]  = useState(false)
  const [platform, setPlatform] = useState<Platform>('none')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promptRef = useRef<any>(null)

  useEffect(() => {
    // Never show if previously dismissed or already running as installed PWA
    if (localStorage.getItem(STORAGE_KEY)) return
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).standalone === true
    ) return

    // Pick up any prompt captured before this component mounted
    if (_earlyPrompt) promptRef.current = _earlyPrompt

    const ua          = navigator.userAgent
    const isIOSSafari = /iPhone|iPad|iPod/i.test(ua) && !/CriOS/i.test(ua)

    // Schedule the sheet to appear 10s after first message was sent.
    // Guard re-checked inside the timeout to handle dismissal in the interim.
    function schedule(plat: Platform) {
      const firstMsg = localStorage.getItem(FIRST_MSG_KEY)
      if (!firstMsg) return
      const remaining = Math.max(0, DELAY_MS - (Date.now() - parseInt(firstMsg, 10)))
      setTimeout(() => {
        if (localStorage.getItem(STORAGE_KEY)) return
        setPlatform(plat)
        setVisible(true)
      }, remaining)
    }

    // Android / Chromium: capture the deferred install prompt and schedule
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      promptRef.current = e
      _earlyPrompt      = e
      schedule('android')
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // Browser fires this when the user installs via the OS-level dialog
    const handleInstalled = () => {
      setVisible(false)
      localStorage.setItem(STORAGE_KEY, '1')
      promptRef.current = null
      _earlyPrompt      = null
    }
    window.addEventListener('appinstalled', handleInstalled)

    // Kick off schedule based on what's already available
    if (isIOSSafari)       schedule('ios')
    if (promptRef.current) schedule('android')

    // Cross-tab: first message written while this tab is open in the background
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== FIRST_MSG_KEY || !e.newValue) return
      if (promptRef.current)  schedule('android')
      else if (isIOSSafari)   schedule('ios')
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled',        handleInstalled)
      window.removeEventListener('storage',             handleStorage)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss() {
    setVisible(false)
    localStorage.setItem(STORAGE_KEY, '1')
  }

  async function handleInstall() {
    if (!promptRef.current) { dismiss(); return }
    promptRef.current.prompt()
    const { outcome } = await promptRef.current.userChoice
    promptRef.current = null
    _earlyPrompt      = null
    if (outcome === 'accepted') localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && platform !== 'none' && (
        <motion.div
          key="install-prompt"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
          role="dialog"
          aria-modal="true"
          aria-label={platform === 'ios' ? 'Install Nexus on iOS' : 'Install Nexus'}
        >
          <div className="w-full max-w-[480px] mx-auto flex flex-col gap-6 px-4 pt-6">
            {platform === 'ios'
              ? <IOSContent  onDismiss={dismiss} />
              : <AndroidContent onInstall={handleInstall} onDismiss={dismiss} />
            }
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function IOSContent({ onDismiss }: { onDismiss: () => void }) {
  return (
    <>
      <SheetHeader
        title="Get the app on iOS"
        subtitle="Receive notifications and stay up to date with your squad."
      />
      <div className="flex flex-col gap-4 w-full overflow-hidden">
        {IOS_STEPS.map((text, i) => (
          <StepRow key={i} num={i + 1} text={text} />
        ))}
      </div>
      <SheetButton onClick={onDismiss} label="I'LL DO IT LATER" />
    </>
  )
}

function AndroidContent({ onInstall, onDismiss }: { onInstall: () => void; onDismiss: () => void }) {
  return (
    <>
      <SheetHeader
        title="Install the app"
        subtitle="Receive notifications and stay up to date with your squad."
      />
      <div className="flex flex-col gap-3 w-full">
        <SheetButton onClick={onInstall} label="INSTALL APP" filled />
        <SheetButton onClick={onDismiss} label="I'LL DO IT LATER" />
      </div>
    </>
  )
}

function SheetHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <p className="font-body font-bold text-[length:var(--text-lg)] text-primary leading-none">
        {title}
      </p>
      <p className="font-body text-[length:var(--text-xs)] text-tertiary leading-normal">
        {subtitle}
      </p>
    </div>
  )
}

function StepRow({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-center gap-4 w-full bg-surface overflow-hidden">
      <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center border-r border-border">
        <span className="font-silkscreen text-[20px] text-white leading-none">{num}</span>
      </div>
      <p className="flex-1 min-w-0 font-body text-[length:var(--text-sm)] text-secondary leading-normal">
        {text}
      </p>
    </div>
  )
}

function SheetButton({ onClick, label, filled = false }: {
  onClick: () => void
  label:   string
  filled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full h-12 flex items-center justify-center overflow-hidden',
        'font-silkscreen text-[length:var(--text-xs)] leading-none',
        'border border-purple',
        'shadow-[4px_4px_0px_0px_rgba(168,85,247,0.5)]',
        'active:shadow-none active:translate-y-px transition-all',
        filled ? 'bg-purple text-black' : 'bg-black text-purple',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
