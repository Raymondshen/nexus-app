'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { Plus } from 'pixelarticons/react/Plus'
import { createAnnouncementAction } from '@/app/(app)/home/actions'
import { toggleFriendshipXPAction, resetFriendshipXPAction } from '@/app/(app)/profile/developer/actions'

function BackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex items-center justify-center flex-shrink-0"
      style={{ width: 24, height: 24 }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
    </button>
  )
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        width: 40,
        height: 24,
        borderRadius: 40,
        background: enabled ? '#a855f7' : '#27272a',
      }}
      aria-checked={enabled}
      role="switch"
    >
      <motion.span
        className="absolute top-[4px] w-4 h-4 rounded-full bg-white pointer-events-none"
        animate={{ left: enabled ? 20 : 4 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </button>
  )
}

function NavRow({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center w-full text-left" style={{ gap: 'var(--space-4)' }}>
      <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
        <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
          {title}
        </p>
        <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}>
          {description}
        </p>
      </div>
      <ChevronRight style={{ width: 16, height: 16, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
    </button>
  )
}

function ToggleRow({ title, description, enabled, onChange }: { title: string; description: string; enabled: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center w-full" style={{ gap: 'var(--space-4)' }}>
      <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
        <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
          {title}
        </p>
        <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}>
          {description}
        </p>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onChange} />
    </div>
  )
}

interface DeveloperClientProps {
  userId: string
  initialCoins: number
  initialFriendshipXPEnabled: boolean
}

export function DeveloperClient({ userId: _userId, initialCoins, initialFriendshipXPEnabled }: DeveloperClientProps) {
  const router = useRouter()

  const [devMode,             setDevMode]             = useState(false)
  const [showPush,            setShowPush]            = useState(false)
  const [infiniteCoins,       setInfiniteCoins]       = useState(false)
  const [chatCamera,          setChatCamera]          = useState(false)
  const [friendshipXP,        setFriendshipXP]        = useState(initialFriendshipXPEnabled)
  const [infiniteFriendshipXP, setInfiniteFriendshipXP] = useState(false)
  const [fxpResetConfirm,     setFxpResetConfirm]     = useState(false)
  const [resettingFXP,        setResettingFXP]        = useState(false)
  const [fxpResetDone,        setFxpResetDone]        = useState(false)
  const [newText,             setNewText]             = useState('')
  const [addingBanner,        setAddingBanner]        = useState(false)
  const [bannerError,         setBannerError]         = useState<string | null>(null)
  const [addedSuccess,        setAddedSuccess]        = useState(false)

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
    setShowPush(localStorage.getItem('nexus_push_diag') === '1')
    setInfiniteCoins(localStorage.getItem('nexus_infinite_coins') === '1')
    setChatCamera(localStorage.getItem('nexus_chat_camera') === '1')
    setInfiniteFriendshipXP(localStorage.getItem('nexus_infinite_fxp') === '1')
  }, [])

  function toggleDevMode() {
    const next = !devMode
    setDevMode(next)
    if (next) localStorage.setItem('nexus_dev_mode', '1')
    else localStorage.removeItem('nexus_dev_mode')
  }

  function toggleShowPush() {
    const next = !showPush
    setShowPush(next)
    if (next) localStorage.setItem('nexus_push_diag', '1')
    else localStorage.removeItem('nexus_push_diag')
    window.dispatchEvent(new CustomEvent('nexus-push-diag-change', { detail: { on: next } }))
  }

  function toggleInfiniteCoins() {
    const next = !infiniteCoins
    setInfiniteCoins(next)
    if (next) localStorage.setItem('nexus_infinite_coins', '1')
    else localStorage.removeItem('nexus_infinite_coins')
    window.dispatchEvent(new CustomEvent('nexus-infinite-coins-change', { detail: { on: next } }))
  }

  function toggleChatCamera() {
    const next = !chatCamera
    setChatCamera(next)
    if (next) localStorage.setItem('nexus_chat_camera', '1')
    else localStorage.removeItem('nexus_chat_camera')
  }

  async function toggleFriendshipXP() {
    const next = !friendshipXP
    setFriendshipXP(next)
    await toggleFriendshipXPAction(next)
  }

  function toggleInfiniteFriendshipXP() {
    const next = !infiniteFriendshipXP
    setInfiniteFriendshipXP(next)
    if (next) localStorage.setItem('nexus_infinite_fxp', '1')
    else localStorage.removeItem('nexus_infinite_fxp')
    window.dispatchEvent(new CustomEvent('nexus-infinite-fxp-change', { detail: { on: next } }))
  }

  async function handleResetFriendshipXP() {
    if (!fxpResetConfirm) { setFxpResetConfirm(true); return }
    if (resettingFXP) return
    setResettingFXP(true)
    const result = await resetFriendshipXPAction()
    setResettingFXP(false)
    setFxpResetConfirm(false)
    if (!result.error) {
      setFxpResetDone(true)
      setTimeout(() => setFxpResetDone(false), 2000)
    }
  }

  async function handleCreateBanner() {
    if (!newText.trim() || addingBanner) return
    setAddingBanner(true)
    setBannerError(null)
    const result = await createAnnouncementAction(newText.trim())
    setAddingBanner(false)
    if (result.error) { setBannerError(result.error); return }
    setNewText('')
    setAddedSuccess(true)
    setTimeout(() => setAddedSuccess(false), 2000)
  }

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
      backHref="/profile"
    >
      {/* Header */}
      <div
        className="flex-shrink-0 w-full"
        style={{
          paddingLeft: 'var(--space-5)',
          paddingRight: 'var(--space-5)',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
          paddingBottom: 'var(--space-3)',
        }}
      >
        <div className="flex h-[40px] items-center" style={{ gap: 'var(--space-3)' }}>
          <BackButton />
          <p
            className="font-silkscreen text-primary uppercase leading-none"
            style={{ fontSize: 'var(--text-xxl)' }}
          >
            Developer Settings
          </p>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          gap: 'var(--space-7)',
          padding: 'var(--space-5)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))',
        }}
      >

        {/* Announcements section */}
        <div className="flex flex-col w-full" style={{ gap: 'var(--space-3)' }}>
          <p
            className="font-body font-medium text-primary tracking-[0.2px] leading-normal"
            style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
          >
            Announcements
          </p>

          {/* Text input */}
          <div
            className="border flex h-[48px] items-center overflow-hidden w-full"
            style={{ borderColor: 'var(--color-border)', paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)' }}
          >
            <input
              value={newText}
              onChange={(e) => { setNewText(e.target.value.slice(0, 500)); setBannerError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBanner() }}
              placeholder="New announcement text..."
              maxLength={500}
              className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none leading-normal"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            />
          </div>

          {bannerError && (
            <p className="font-pixel leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
              {bannerError}
            </p>
          )}

          {/* Add announcement button */}
          <button
            onClick={handleCreateBanner}
            disabled={!newText.trim() || addingBanner}
            className="flex items-center justify-center overflow-hidden w-full disabled:opacity-40"
            style={{
              background: addedSuccess ? '#22c55e' : 'var(--color-purple)',
              gap: 'var(--space-2)',
              paddingLeft: 'var(--space-5)',
              paddingRight: 'var(--space-5)',
              paddingTop: 'var(--space-4)',
              paddingBottom: 'var(--space-4)',
              boxShadow: addedSuccess
                ? '4px 4px 0px 0px rgba(34,197,94,0.5)'
                : '4px 4px 0px 0px rgba(168,85,247,0.5)',
              transition: 'background 0.2s, box-shadow 0.2s',
            }}
          >
            <Plus style={{ width: 12, height: 12, color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
            <span className="font-silkscreen text-primary leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xxs)' }}>
              {addingBanner ? '...' : addedSuccess ? 'Added!' : 'Add announcement'}
            </span>
          </button>

          {/* Published Announcements row */}
          <NavRow
            title="Published Announcements"
            description="View all published announcements"
            onClick={() => router.push('/profile/developer/announcements')}
          />
        </div>

        {/* Debug section */}
        <div className="flex flex-col w-full" style={{ gap: 'var(--space-3)' }}>
          <p
            className="font-body font-medium text-primary tracking-[0.2px] leading-normal"
            style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
          >
            Debug
          </p>

          <NavRow
            title="Error Logs"
            description="View client errors from all Google users"
            onClick={() => router.push('/profile/error-logs')}
          />

          <ToggleRow
            title="Notification Subscription"
            description="Test push notification."
            enabled={showPush}
            onChange={toggleShowPush}
          />
        </div>

        {/* Features section */}
        <div className="flex flex-col w-full" style={{ gap: 'var(--space-3)' }}>
          <p
            className="font-body font-medium text-primary tracking-[0.2px] leading-normal"
            style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
          >
            Features
          </p>

          <ToggleRow
            title="Infinite Coins"
            description={`Balance : ${initialCoins.toLocaleString()} coins`}
            enabled={infiniteCoins}
            onChange={toggleInfiniteCoins}
          />

          <ToggleRow
            title="Spawn Boss Mode"
            description="Display boss spawn button in chat"
            enabled={devMode}
            onChange={toggleDevMode}
          />

          <ToggleRow
            title="Chat Camera"
            description="Enable image upload button in chat input"
            enabled={chatCamera}
            onChange={toggleChatCamera}
          />

          <ToggleRow
            title="Friendship XP — Beta"
            description="Award bilateral XP in DMs and @mentions"
            enabled={friendshipXP}
            onChange={toggleFriendshipXP}
          />

          <ToggleRow
            title="Infinite Friendship XP"
            description="Show ∞ on the home card heart badge"
            enabled={infiniteFriendshipXP}
            onChange={toggleInfiniteFriendshipXP}
          />

          {/* Reset friendship XP — two-step confirm */}
          <div className="flex items-center w-full" style={{ gap: 'var(--space-4)' }}>
            <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
              <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                Reset Friendship XP
              </p>
              <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}>
                Wipe all friendship XP pairs for your account
              </p>
            </div>
            <button
              onClick={handleResetFriendshipXP}
              disabled={resettingFXP}
              onBlur={() => setFxpResetConfirm(false)}
              className="flex-shrink-0 flex items-center justify-center overflow-hidden disabled:opacity-40"
              style={{
                background: fxpResetDone ? '#22c55e' : fxpResetConfirm ? '#ef4444' : '#27272a',
                padding: '4px 10px',
                minWidth: 64,
                transition: 'background 0.15s',
              }}
            >
              <span className="font-silkscreen leading-none whitespace-nowrap text-primary" style={{ fontSize: 'var(--text-mini)' }}>
                {resettingFXP ? '...' : fxpResetDone ? 'Done!' : fxpResetConfirm ? 'Confirm?' : 'Reset'}
              </span>
            </button>
          </div>
        </div>

      </div>
    </SlidePage>
  )
}
