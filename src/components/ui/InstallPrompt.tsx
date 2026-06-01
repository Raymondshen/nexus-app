'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

const STORAGE_KEY = 'nexus_install_prompted'
const FIRST_MSG_KEY = 'nexus_first_message'
const DELAY_MS = 10_000

type Platform = 'ios' | 'android' | 'none'

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'none'

  const ua = navigator.userAgent
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true

  if (isStandalone) return 'none'
  if (localStorage.getItem(STORAGE_KEY)) return 'none'

  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isChromeIOS = /CriOS/i.test(ua)
  if (isIOS && !isChromeIOS) return 'ios'

  // Android Chrome: detected via beforeinstallprompt event, not UA sniff
  return 'none'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deferredPrompt: any = null

export function InstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [platform, setPlatform] = useState<Platform>('none')

  const dismiss = useCallback(() => {
    setVisible(false)
    localStorage.setItem(STORAGE_KEY, '1')
  }, [])

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).standalone === true
    if (isStandalone) return

    // Capture Android Chrome install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      deferredPrompt = e
      setPlatform('android')
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    const plat = detectPlatform()
    if (plat !== 'none') setPlatform(plat)

    function maybeShow(currentPlatform: Platform) {
      if (currentPlatform === 'none') return
      const firstMsg = localStorage.getItem(FIRST_MSG_KEY)
      if (!firstMsg) return

      const elapsed = Date.now() - parseInt(firstMsg, 10)
      const remaining = Math.max(0, DELAY_MS - elapsed)
      setTimeout(() => setVisible(true), remaining)
    }

    // Poll once on mount, then check after first message key might appear
    maybeShow(plat)

    // Listen for the first-message flag being set (cross-tab / same session)
    const storageHandler = (e: StorageEvent) => {
      if (e.key === FIRST_MSG_KEY && e.newValue) {
        setPlatform((p) => {
          maybeShow(p)
          return p
        })
      }
    }
    window.addEventListener('storage', storageHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('storage', storageHandler)
    }
  }, [])

  // Re-check when platform changes (e.g. android prompt captured)
  useEffect(() => {
    if (platform === 'none') return
    const firstMsg = localStorage.getItem(FIRST_MSG_KEY)
    if (!firstMsg) return
    const elapsed = Date.now() - parseInt(firstMsg, 10)
    const remaining = Math.max(0, DELAY_MS - elapsed)
    setTimeout(() => setVisible(true), remaining)
  }, [platform])

  async function handleInstallAndroid() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    if (outcome === 'accepted') {
      localStorage.setItem(STORAGE_KEY, '1')
    }
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
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0820] border-t-2 border-[#bf5fff]"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        >
          {platform === 'ios' ? <IOSContent onDismiss={dismiss} /> : <AndroidContent onInstall={handleInstallAndroid} onDismiss={dismiss} />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function IOSContent({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="px-5 pt-5 pb-2">
      <div className="flex items-start justify-between mb-4">
        <h2 className="font-pixel text-[10px] text-[#bf5fff] leading-relaxed">
          ADD TO HOME SCREEN
        </h2>
        <button
          onClick={onDismiss}
          className="w-8 h-8 flex items-center justify-center text-[#6b4f8f] hover:text-white"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <Step num={1} text="Tap the share icon below" icon={<ShareIcon />} />
        <Step num={2} text='Select "Add to Home Screen"' />
        <Step num={3} text='Tap "Add" in the top right' />
      </div>

      <p className="font-pixel text-[7px] text-[#3d2660] mt-4 text-center leading-relaxed">
        Play Nexus directly from your home screen
      </p>
    </div>
  )
}

function AndroidContent({ onInstall, onDismiss }: { onInstall: () => void; onDismiss: () => void }) {
  return (
    <div className="px-5 pt-5 pb-2">
      <div className="flex items-start justify-between mb-3">
        <h2 className="font-pixel text-[10px] text-[#bf5fff] leading-relaxed">
          INSTALL NEXUS
        </h2>
        <button
          onClick={onDismiss}
          className="w-8 h-8 flex items-center justify-center text-[#6b4f8f] hover:text-white"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      <p className="font-sans text-sm text-[#a78fc0] mb-5 leading-relaxed">
        Play directly from your home screen
      </p>

      <div className="flex gap-3">
        <button
          onClick={onDismiss}
          className="flex-1 h-12 font-pixel text-[9px] text-[#6b4f8f] border border-[#2a1545] hover:border-[#bf5fff] transition-colors"
        >
          LATER
        </button>
        <button
          onClick={onInstall}
          className="flex-1 h-12 font-pixel text-[9px] text-[#0a0612] bg-[#bf5fff] shadow-[2px_2px_0px_#7b2fa8] active:shadow-none active:translate-y-[1px] transition-all"
        >
          INSTALL
        </button>
      </div>
    </div>
  )
}

function Step({ num, text, icon }: { num: number; text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-h-[44px]">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#2a1545] flex items-center justify-center font-pixel text-[8px] text-[#bf5fff]">
        {num}
      </span>
      <span className="font-sans text-sm text-white leading-snug flex-1">{text}</span>
      {icon && <span className="flex-shrink-0 text-[#bf5fff]">{icon}</span>}
    </div>
  )
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}
