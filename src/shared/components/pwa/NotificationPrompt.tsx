'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Close } from 'pixelarticons/react/Close'
import { requestPermission, subscribeToPush, isSupported, getPermissionState } from '@/shared/utils/notifications'

const PROMPTED_KEY = 'nexus_notif_prompted'
const CREW_KEY     = 'nexus_crew_created'
const RETRY_MS     = 24 * 60 * 60 * 1000 // 24 hours

type PromptState = 'hidden' | 'visible' | 'granted' | 'denied' | 'sub_failed'

export function NotificationPrompt() {
  const [state, setState] = useState<PromptState>('hidden')

  useEffect(() => {
    if (!isSupported()) return

    // Already granted — no need to ask
    if (getPermissionState() === 'granted') return

    // Check if crew was just created
    const crewCreated = localStorage.getItem(CREW_KEY)
    if (!crewCreated) return

    // Throttle: don't re-prompt within 24 hours
    const lastPrompted = localStorage.getItem(PROMPTED_KEY)
    if (lastPrompted && Date.now() - parseInt(lastPrompted, 10) < RETRY_MS) return

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
    localStorage.setItem(PROMPTED_KEY, String(Date.now()))
  }, [])

  const handleLater = useCallback(() => {
    setState('hidden')
    localStorage.setItem(PROMPTED_KEY, String(Date.now()))
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
          className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0820] border-t-2 border-[#bf5fff]"
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
          <h2 className="font-pixel text-[10px] text-[#bf5fff] leading-relaxed">
            RAID ALERTS
          </h2>
        </div>
        <button
          onClick={onLater}
          className="w-8 h-8 flex items-center justify-center text-[#6b4f8f] hover:text-white"
          aria-label="Dismiss"
        >
          <Close style={{ width: 16, height: 16 }} aria-hidden="true" />
        </button>
      </div>

      {subFailed ? (
        <p className="font-sans text-sm text-[#ff9944] mb-5 leading-relaxed">
          Setup failed. Make sure this app is added to your<br />
          <strong className="text-white">Home Screen</strong>, then tap Enable again.
        </p>
      ) : (
        <p className="font-sans text-sm text-[#a78fc0] mb-5 leading-relaxed">
          Get notified when a boss spawns.<br />
          Never leave your crew hanging.
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onLater}
          className="flex-1 h-12 font-pixel text-[9px] text-[#6b4f8f] border border-[#2a1545] hover:border-[#bf5fff] transition-colors"
        >
          LATER
        </button>
        <button
          onClick={onEnable}
          className="flex-1 h-12 font-pixel text-[9px] text-[#0a0612] bg-[#bf5fff] shadow-[2px_2px_0px_#7b2fa8] active:shadow-none active:translate-y-[1px] transition-all"
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
      <span className="font-pixel text-[10px] text-[#66bb6a]">Raid alerts enabled ✓</span>
    </div>
  )
}

function DeniedContent({ onClose }: { onClose: () => void }) {
  return (
    <div className="px-5 pt-5 pb-2">
      <div className="flex items-start justify-between mb-3">
        <h2 className="font-pixel text-[10px] text-[#ff4444] leading-relaxed">
          NOTIFICATIONS BLOCKED
        </h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-[#6b4f8f] hover:text-white"
          aria-label="Close"
        >
          <Close style={{ width: 16, height: 16 }} aria-hidden="true" />
        </button>
      </div>
      <p className="font-sans text-sm text-[#a78fc0] mb-4 leading-relaxed">
        Enable in your phone settings:<br />
        <strong className="text-white">Settings → Notifications → Nexus → Allow</strong>
      </p>
      <button
        onClick={onClose}
        className="w-full h-12 font-pixel text-[9px] text-[#6b4f8f] border border-[#2a1545]"
      >
        CLOSE
      </button>
    </div>
  )
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bf5fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <line x1="12" y1="2" x2="12" y2="4" />
    </svg>
  )
}
