'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { Plus } from 'pixelarticons/react/Plus'
import { createAnnouncementAction, getActiveAnnouncementsAction } from '@/app/(app)/home/actions'
import { AnnouncementsSheetView } from '@/shared/components/banners/AnnouncementsSheet'
import type { AnnouncementItem } from '@/shared/components/banners/AnnouncementsSheet'
import {
  resetFriendshipXPAction,
  resetGemCooldownAction,
  spawnBossAction,
  endRaidAction,
  selfDownAction,
  addReviveTokenAction,
  resetCombatAction,
  triggerBossAttackAction,
} from '@/app/(app)/profile/developer/actions'
import { clearGemClaimRecord } from '@/shared/utils/gems'

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
        width: 48,
        height: 28,
        borderRadius: 40,
        background: enabled ? 'var(--color-purple)' : 'var(--color-border)',
      }}
      aria-checked={enabled}
      role="switch"
    >
      <motion.span
        className="absolute top-[4px] rounded-full bg-white pointer-events-none"
        style={{ width: 20, height: 20 }}
        animate={{ left: enabled ? 24 : 4 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </button>
  )
}

function NavRow({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center w-full text-left" style={{ gap: 'var(--space-3)' }}>
      <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
        <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
          {title}
        </p>
        <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
          {description}
        </p>
      </div>
      <ChevronRight style={{ width: 20, height: 20, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
    </button>
  )
}

function ToggleRow({ title, description, enabled, onChange }: { title: string; description: string; enabled: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center w-full" style={{ gap: 'var(--space-3)' }}>
      <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
        <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
          {title}
        </p>
        <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
          {description}
        </p>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onChange} />
    </div>
  )
}

type ActionState = 'idle' | 'loading' | 'done' | 'confirm' | 'error'

interface DeveloperClientProps {
  userId:       string
  initialCoins: number
  userCrews:    { id: string; name: string }[]
}

export function DeveloperClient({ userId: _userId, initialCoins, userCrews }: DeveloperClientProps) {
  const router = useRouter()

  const [devMode,             setDevMode]             = useState(false)
  const [showPush,            setShowPush]            = useState(false)
  const [infiniteCoins,       setInfiniteCoins]       = useState(false)
  const [chatCamera,          setChatCamera]          = useState(false)
  const [pollFeature,         setPollFeature]         = useState(false)
  const [eventsFeature,       setEventsFeature]       = useState(false)
  const [friendshipXP,        setFriendshipXP]        = useState(false)
  const [combatSystem,        setCombatSystem]        = useState(false)
  const [fxpResetConfirm,     setFxpResetConfirm]     = useState(false)
  const [resettingFXP,        setResettingFXP]        = useState(false)
  const [fxpResetDone,        setFxpResetDone]        = useState(false)
  const [gemResetConfirm,     setGemResetConfirm]     = useState(false)
  const [resettingGem,        setResettingGem]        = useState(false)
  const [gemResetDone,        setGemResetDone]        = useState(false)
  const [newTitle,            setNewTitle]            = useState('')
  const [newText,             setNewText]             = useState('')
  const [newImageUrl,         setNewImageUrl]         = useState('')
  const [addingBanner,        setAddingBanner]        = useState(false)
  const [bannerError,         setBannerError]         = useState<string | null>(null)
  const [addedSuccess,        setAddedSuccess]        = useState(false)
  const [previewAnnouncements, setPreviewAnnouncements] = useState<AnnouncementItem[]>([])
  const [previewOpen,          setPreviewOpen]          = useState(false)
  const [previewLoading,       setPreviewLoading]       = useState(false)
  const [previewError,         setPreviewError]         = useState<string | null>(null)

  // combat testing
  const [selectedCrewId,   setSelectedCrewId]   = useState<string>(userCrews[0]?.id ?? '')
  const [spawnState,       setSpawnState]        = useState<ActionState>('idle')
  const [endRaidState,     setEndRaidState]      = useState<ActionState>('idle')
  const [selfDownState,    setSelfDownState]     = useState<ActionState>('idle')
  const [reviveState,      setReviveState]       = useState<ActionState>('idle')
  const [resetState,       setResetState]        = useState<ActionState>('idle')
  const [bossAttackState,  setBossAttackState]   = useState<ActionState>('idle')
  const [combatError,      setCombatError]       = useState<string | null>(null)

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
    setShowPush(localStorage.getItem('nexus_push_diag') === '1')
    setInfiniteCoins(localStorage.getItem('nexus_infinite_coins') === '1')
    setChatCamera(localStorage.getItem('nexus_chat_camera') === '1')
    setPollFeature(localStorage.getItem('nexus_poll_feature') === '1')
    setEventsFeature(localStorage.getItem('nexus_events_enabled') === '1')
    setFriendshipXP(localStorage.getItem('nexus_friendship_xp') === '1')
    setCombatSystem(localStorage.getItem('nexus_combat_system') === '1')
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

  function togglePollFeature() {
    const next = !pollFeature
    setPollFeature(next)
    if (next) localStorage.setItem('nexus_poll_feature', '1')
    else localStorage.removeItem('nexus_poll_feature')
    window.dispatchEvent(new CustomEvent('nexus-poll-feature-change', { detail: { on: next } }))
  }

  function toggleEventsFeature() {
    const next = !eventsFeature
    setEventsFeature(next)
    if (next) localStorage.setItem('nexus_events_enabled', '1')
    else localStorage.removeItem('nexus_events_enabled')
    window.dispatchEvent(new CustomEvent('nexus-events-feature-change', { detail: { on: next } }))
  }

  function toggleFriendshipXP() {
    const next = !friendshipXP
    setFriendshipXP(next)
    if (next) localStorage.setItem('nexus_friendship_xp', '1')
    else localStorage.removeItem('nexus_friendship_xp')
    window.dispatchEvent(new CustomEvent('nexus-friendship-xp-change', { detail: { on: next } }))
  }

  function toggleCombatSystem() {
    const next = !combatSystem
    setCombatSystem(next)
    if (next) localStorage.setItem('nexus_combat_system', '1')
    else localStorage.removeItem('nexus_combat_system')
    window.dispatchEvent(new CustomEvent('nexus-combat-system-change', { detail: { on: next } }))
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

  async function handleResetGemCooldown() {
    if (!gemResetConfirm) { setGemResetConfirm(true); return }
    if (resettingGem) return
    setResettingGem(true)
    const result = await resetGemCooldownAction()
    if (!result.error) await clearGemClaimRecord()
    setResettingGem(false)
    setGemResetConfirm(false)
    if (!result.error) {
      setGemResetDone(true)
      setTimeout(() => setGemResetDone(false), 2000)
    }
  }

  async function handleCreateBanner() {
    if (!newTitle.trim() || !newText.trim() || !newImageUrl.trim() || addingBanner) return
    setAddingBanner(true)
    setBannerError(null)
    const result = await createAnnouncementAction(newTitle.trim(), newText.trim(), newImageUrl.trim())
    setAddingBanner(false)
    if (result.error) { setBannerError(result.error); return }
    setNewTitle('')
    setNewText('')
    setNewImageUrl('')
    setAddedSuccess(true)
    setTimeout(() => setAddedSuccess(false), 2000)
  }

  async function handlePreviewAnnouncements() {
    if (previewLoading) return
    setPreviewLoading(true)
    setPreviewError(null)
    const { data } = await getActiveAnnouncementsAction()
    setPreviewLoading(false)
    if (data.length === 0) { setPreviewError('No active announcements'); return }
    setPreviewAnnouncements(data)
    setPreviewOpen(true)
  }

  // ── Combat action helpers ──────────────────────────────────────────────────

  async function runCombatAction(
    setState: (s: ActionState) => void,
    currentState: ActionState,
    action: () => Promise<{ ok?: boolean; error?: string }>,
    requiresConfirm = false,
  ) {
    if (requiresConfirm && currentState !== 'confirm') { setState('confirm'); return }
    setState('loading')
    setCombatError(null)
    const result = await action()
    if (result.error) {
      setCombatError(result.error)
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    } else {
      setState('done')
      setTimeout(() => setState('idle'), 2000)
    }
  }

  const settingsRows: {
    key:         string
    title:       string
    description: string
    label:       string
    background:  string
    disabled:    boolean
    onClick:     () => void
    onBlur?:     () => void
  }[] = [
    {
      key:         'preview-announcements',
      title:       'Preview Announcements Sheet',
      description: previewError ?? 'Force-show the announcements bottom sheet with all active announcements',
      label:       previewLoading ? '...' : 'Preview',
      background:  previewError ? 'var(--color-danger)' : 'var(--color-border)',
      disabled:    previewLoading,
      onClick:     handlePreviewAnnouncements,
    },
    {
      key:         'reset-gem-cooldown',
      title:       'Reset Gem Cooldown',
      description: "Allow claiming today's daily gem again, for your account only",
      label:       resettingGem ? '...' : gemResetDone ? 'Done!' : gemResetConfirm ? 'Confirm?' : 'Reset',
      background:  gemResetDone ? 'var(--color-success)' : gemResetConfirm ? 'var(--color-danger)' : 'var(--color-border)',
      disabled:    resettingGem,
      onClick:     handleResetGemCooldown,
      onBlur:      () => setGemResetConfirm(false),
    },
    {
      key:         'reset-friendship-xp',
      title:       'Reset Friendship XP',
      description: 'Wipe all friendship XP pairs for your account',
      label:       resettingFXP ? '...' : fxpResetDone ? 'Done!' : fxpResetConfirm ? 'Confirm?' : 'Reset',
      background:  fxpResetDone ? 'var(--color-success)' : fxpResetConfirm ? 'var(--color-danger)' : 'var(--color-border)',
      disabled:    resettingFXP,
      onClick:     handleResetFriendshipXP,
      onBlur:      () => setFxpResetConfirm(false),
    },
  ]

  const combatRows: {
    title:          string
    description:    string
    state:          ActionState
    onPress:        () => void
    onBlur?:        () => void
    danger?:        boolean
  }[] = [
    {
      title:       'Spawn Boss',
      description: 'Force-spawn a random boss raid for the selected squad',
      state:       spawnState,
      onPress:     () => runCombatAction(setSpawnState, spawnState, () => spawnBossAction(selectedCrewId)),
    },
    {
      title:       'End Raid',
      description: 'Mark the active raid as defeated (no artifact drop)',
      state:       endRaidState,
      onPress:     () => runCombatAction(setEndRaidState, endRaidState, () => endRaidAction(selectedCrewId), true),
      onBlur:      () => setEndRaidState('idle'),
      danger:      false,
    },
    {
      title:       'Down Yourself',
      description: 'Set your combat member to downed state for testing revive',
      state:       selfDownState,
      onPress:     () => runCombatAction(setSelfDownState, selfDownState, () => selfDownAction(selectedCrewId)),
    },
    {
      title:       'Add Revive Token',
      description: 'Give the selected squad +1 revive token',
      state:       reviveState,
      onPress:     () => runCombatAction(setReviveState, reviveState, () => addReviveTokenAction(selectedCrewId)),
    },
    {
      title:       'Trigger Boss Attack',
      description: 'Force boss to attack now, bypassing the 2h timer',
      state:       bossAttackState,
      onPress:     () => runCombatAction(setBossAttackState, bossAttackState, () => triggerBossAttackAction(selectedCrewId)),
    },
    {
      title:       'Reset Combat',
      description: 'Delete all raids and combat data for this squad',
      state:       resetState,
      onPress:     () => runCombatAction(setResetState, resetState, () => resetCombatAction(selectedCrewId), true),
      onBlur:      () => setResetState('idle'),
      danger:      true,
    },
  ]

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 w-full"
        style={{
          paddingLeft:  'var(--space-5)',
          paddingRight: 'var(--space-5)',
          paddingTop:   'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
          paddingBottom: 'var(--space-3)',
        }}
      >
        <div className="flex h-[40px] items-center" style={{ gap: 'var(--space-3)' }}>
          <BackButton />
          <p className="font-silkscreen text-primary uppercase leading-none" style={{ fontSize: 'var(--text-xxl)' }}>
            Developer Settings
          </p>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          gap:           'var(--space-7)',
          padding:       'var(--space-5)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))',
        }}
      >

        {/* Announcements */}
        <div className="flex flex-col w-full" style={{ gap: 'var(--space-5)' }}>
          <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
            <p className="font-body font-medium text-primary tracking-[0.2px] leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
              Announcements
            </p>

            <div
              className="border flex h-[48px] items-center overflow-hidden w-full"
              style={{ borderColor: 'var(--color-border)', paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)' }}
            >
              <input
                value={newTitle}
                onChange={(e) => { setNewTitle(e.target.value.slice(0, 200)); setBannerError(null) }}
                placeholder="Title, e.g. Text Effects"
                maxLength={200}
                className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none leading-normal"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
              />
            </div>

            <div
              className="border flex h-[48px] items-center overflow-hidden w-full"
              style={{ borderColor: 'var(--color-border)', paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)' }}
            >
              <input
                value={newImageUrl}
                onChange={(e) => { setNewImageUrl(e.target.value.slice(0, 300)); setBannerError(null) }}
                placeholder="Image path, e.g. /img/announcements/foo.svg"
                maxLength={300}
                className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none leading-normal"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
              />
            </div>

            <div
              className="border flex h-[48px] items-center overflow-hidden w-full"
              style={{ borderColor: 'var(--color-border)', paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)' }}
            >
              <input
                value={newText}
                onChange={(e) => { setNewText(e.target.value.slice(0, 500)); setBannerError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBanner() }}
                placeholder="Body text..."
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

            <button
              onClick={handleCreateBanner}
              disabled={!newTitle.trim() || !newText.trim() || !newImageUrl.trim() || addingBanner}
              className="flex items-center justify-center overflow-hidden w-full disabled:opacity-40"
              style={{
                background: addedSuccess ? '#22c55e' : 'var(--color-purple)',
                gap:          'var(--space-3)',
                paddingLeft:  'var(--space-6)',
                paddingRight: 'var(--space-6)',
                paddingTop:   'var(--space-5)',
                paddingBottom: 'var(--space-5)',
                boxShadow: addedSuccess
                  ? '4px 4px 0px 0px rgba(34,197,94,0.5)'
                  : '4px 4px 0px 0px rgba(168,85,247,0.5)',
                transition: 'background 0.2s, box-shadow 0.2s',
              }}
            >
              <Plus style={{ width: 16, height: 16, color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
              <span className="font-silkscreen text-primary leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xs)' }}>
                {addingBanner ? '...' : addedSuccess ? 'Added!' : 'Add announcement'}
              </span>
            </button>
          </div>

          <NavRow
            title="Published Announcements"
            description="View all published announcements"
            onClick={() => router.push('/profile/developer/announcements')}
          />
        </div>

        {/* Debug */}
        <div className="flex flex-col w-full" style={{ gap: 'var(--space-5)' }}>
          <p className="font-silkscreen leading-normal tracking-[0.2px] uppercase" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-purple)' }}>
            Debug
          </p>

          <ToggleRow
            title="Dev Mode"
            description="Reveal dev-only tools and testing controls across the app"
            enabled={devMode}
            onChange={toggleDevMode}
          />

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

        {/* Features */}
        <div className="flex flex-col w-full" style={{ gap: 'var(--space-5)' }}>
          <p className="font-silkscreen leading-normal tracking-[0.2px] uppercase" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-purple)' }}>
            Features
          </p>

          <ToggleRow
            title="Infinite Coins"
            description={`Balance : ${initialCoins.toLocaleString()} coins`}
            enabled={infiniteCoins}
            onChange={toggleInfiniteCoins}
          />

          <ToggleRow
            title="Chat Camera"
            description="Enable legacy camera dev flag (no longer gates photo upload)"
            enabled={chatCamera}
            onChange={toggleChatCamera}
          />

          <ToggleRow
            title="Poll Feature"
            description="Show poll creation button in chat input"
            enabled={pollFeature}
            onChange={togglePollFeature}
          />

          <ToggleRow
            title="Events Feature"
            description="Enable group event creation and calendar in chat"
            enabled={eventsFeature}
            onChange={toggleEventsFeature}
          />

          <ToggleRow
            title="Friendship XP System"
            description="DM and @mention XP, bond progress bar, and toast"
            enabled={friendshipXP}
            onChange={toggleFriendshipXP}
          />

          <ToggleRow
            title="Combat System"
            description="Show raid HUD, boss damage floats, and ability controls"
            enabled={combatSystem}
            onChange={toggleCombatSystem}
          />

          {settingsRows.map(({ key, title, description, label, background, disabled, onClick, onBlur }) => (
            <div key={key} className="flex items-center w-full" style={{ gap: 'var(--space-3)' }}>
              <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
                <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                  {title}
                </p>
                <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                  {description}
                </p>
              </div>
              <button
                onClick={onClick}
                disabled={disabled}
                onBlur={onBlur}
                className="flex-shrink-0 flex items-center justify-center overflow-hidden disabled:opacity-40"
                style={{
                  background,
                  padding:    '4px 10px',
                  minWidth:   64,
                  transition: 'background 0.15s',
                }}
              >
                <span className="font-silkscreen leading-none whitespace-nowrap text-primary" style={{ fontSize: 'var(--text-mini)' }}>
                  {label}
                </span>
              </button>
            </div>
          ))}
        </div>

        {/* Combat Testing */}
        <div className="flex flex-col w-full" style={{ gap: 'var(--space-5)' }}>
          <p className="font-silkscreen leading-normal tracking-[0.2px] uppercase" style={{ fontSize: 'var(--text-sm)', color: '#ef4444' }}>
            Combat Testing
          </p>

          {/* Crew picker */}
          {userCrews.length === 0 ? (
            <p className="font-body text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)' }}>
              No squads found.
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
              <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                Target squad
              </p>
              <div className="flex flex-wrap" style={{ gap: 'var(--space-3)' }}>
                {userCrews.map((crew) => {
                  const active = selectedCrewId === crew.id
                  return (
                    <button
                      key={crew.id}
                      onClick={() => { setSelectedCrewId(crew.id); setCombatError(null) }}
                      className="font-silkscreen leading-none"
                      style={{
                        fontSize:   'var(--text-mini)',
                        padding:    '5px 10px',
                        background: active ? '#ef444422' : 'transparent',
                        border:     `1px solid ${active ? '#ef4444' : 'var(--color-border)'}`,
                        color:      active ? '#ef4444' : 'var(--color-tertiary)',
                        transition: 'all 0.1s',
                      }}
                    >
                      {crew.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {combatError && (
            <p className="font-pixel leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
              {combatError}
            </p>
          )}

          {combatRows.map(({ title, description, state, onPress, onBlur, danger }) => (
            <div key={title} className="flex items-center w-full" style={{ gap: 'var(--space-3)' }}>
              <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
                <p
                  className="font-body font-semibold leading-normal"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', color: danger ? '#ef4444' : 'var(--color-secondary)' }}
                >
                  {title}
                </p>
                <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                  {description}
                </p>
              </div>
              <button
                onClick={onPress}
                disabled={state === 'loading' || !selectedCrewId}
                onBlur={onBlur}
                className="flex-shrink-0 flex items-center justify-center overflow-hidden disabled:opacity-40"
                style={{
                  background: state === 'done' ? 'var(--color-success)' : state === 'confirm' || state === 'error' ? 'var(--color-danger)' : 'var(--color-border)',
                  padding:    '4px 10px',
                  minWidth:   64,
                  transition: 'background 0.15s',
                }}
              >
                <span className="font-silkscreen leading-none whitespace-nowrap text-primary" style={{ fontSize: 'var(--text-mini)' }}>
                  {state === 'loading' ? '...' : state === 'done' ? 'Done!' : state === 'confirm' ? 'Sure?' : 'Run'}
                </span>
              </button>
            </div>
          ))}
        </div>

      </div>

      <AnnouncementsSheetView
        announcements={previewOpen ? previewAnnouncements : []}
        onClose={() => setPreviewOpen(false)}
      />
    </SlidePage>
  )
}
