'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Close } from 'pixelarticons/react/Close'
import { requestPermission, subscribeToPush, isSupported } from '@/shared/utils/notifications'

type PromptState = 'hidden' | 'visible' | 'granted' | 'denied' | 'sub_failed'

export function NotificationPrompt() {
  const [state, setState] = useState<PromptState>('hidden')

  // Gating reads browser-only APIs (Notification permission) unavailable during
  // SSR — must run post-mount, not derivable at render time or via a lazy
  // useState initializer without a hydration mismatch. Not a state-mirroring
  // anti-pattern.
  //
  // No localStorage throttle and no crew-created gate: this effect runs once
  // per hard app load ((app)/layout.tsx is a shared layout that only remounts
  // on a genuine hard load — first launch, hard refresh, or SWRegister's
  // post-deploy reload — never on ordinary client-side navigation, same
  // property LaunchSplashGate relies on). That makes "prompt while unsubscribed"
  // naturally once-per-session without extra bookkeeping. Gated on the browser's
  // own live 'default' permission (never asked), not getPermissionState()'s
  // granted/denied/unsupported — a user who already denied shouldn't be
  // re-nagged every relaunch, since the browser won't re-show its own native
  // prompt for them anyway (DeniedContent below points them at OS Settings
  // instead, on the rare path where they still land in that state this session).
  useEffect(() => {
    if (!isSupported()) return
    if (Notification.permission !== 'default') return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState('visible')
  }, [])

  const handleEnable = useCallback(async () => {
    const result = await requestPermission()
    if (result === 'granted') {
      const sub = await subscribeToPush()
      if (sub) {
        setState('granted')
        setTimeout(() => setState('hidden'), 2000)
      } else {
        // Permission was granted by the OS but the push subscription failed.
        // Keep the prompt visible so the user can retry.
        setState('sub_failed')
      }
    } else {
      setState('denied')
    }
  }, [])

  const handleLater = useCallback(() => {
    setState('hidden')
  }, [])

  return (
    <AnimatePresence>
      {state !== 'hidden' && (
        <motion.div
          key="notif-prompt"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-black border-t-2 border-purple"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        >
          {(state === 'visible' || state === 'sub_failed') && (
            <DefaultContent onEnable={handleEnable} onLater={handleLater} subFailed={state === 'sub_failed'} />
          )}
          {state === 'granted' && <GrantedContent />}
          {state === 'denied'  && <DeniedContent onClose={() => setState('hidden')} />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function DefaultContent({
  onEnable,
  onLater,
  subFailed = false,
}: {
  onEnable:  () => void
  onLater:   () => void
  subFailed?: boolean
}) {
  return (
    <div className="px-5 pt-5 pb-2">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <BellIcon />
          <h2 className="font-pixel text-[10px] text-purple leading-relaxed">
            SQUAD ALERTS
          </h2>
        </div>
        <button
          onClick={onLater}
          className="w-8 h-8 flex items-center justify-center text-tertiary hover:text-primary"
          aria-label="Dismiss"
        >
          <Close style={{ width: 16, height: 16 }} aria-hidden="true" />
        </button>
      </div>

      {subFailed ? (
        <p className="font-sans text-sm text-yellow mb-5 leading-relaxed">
          Setup failed. Make sure this app is added to your<br />
          <strong className="text-primary">Home Screen</strong>, then tap Enable again.
        </p>
      ) : (
        <p className="font-sans text-sm text-tertiary mb-5 leading-relaxed">
          Get notified about new messages, mentions, and replies.<br />
          Never leave your crew hanging.
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onLater}
          className="flex-1 h-12 font-pixel text-[9px] text-tertiary border border-border hover:border-purple transition-colors"
        >
          LATER
        </button>
        <button
          onClick={onEnable}
          className="flex-1 h-12 font-pixel text-[9px] text-black bg-purple shadow-[2px_2px_0px_0px_rgba(168,85,247,0.5)] active:shadow-none active:translate-y-[1px] transition-all"
        >
          ENABLE
        </button>
      </div>
    </div>
  )
}

function GrantedContent() {
  return (
    <div className="px-5 py-6 flex items-center justify-center gap-3">
      <span className="font-pixel text-[10px]" style={{ color: 'var(--color-success)' }}>Squad alerts enabled ✓</span>
    </div>
  )
}

function DeniedContent({ onClose }: { onClose: () => void }) {
  return (
    <div className="px-5 pt-5 pb-2">
      <div className="flex items-start justify-between mb-3">
        <h2 className="font-pixel text-[10px] leading-relaxed" style={{ color: 'var(--color-danger)' }}>
          NOTIFICATIONS BLOCKED
        </h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-tertiary hover:text-primary"
          aria-label="Close"
        >
          <Close style={{ width: 16, height: 16 }} aria-hidden="true" />
        </button>
      </div>
      <p className="font-sans text-sm text-tertiary mb-4 leading-relaxed">
        Enable in your phone settings:<br />
        <strong className="text-primary">Settings → Notifications → Nexus → Allow</strong>
      </p>
      <button
        onClick={onClose}
        className="w-full h-12 font-pixel text-[9px] text-tertiary border border-border"
      >
        CLOSE
      </button>
    </div>
  )
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <line x1="12" y1="2" x2="12" y2="4" />
    </svg>
  )
}
