'use client'

import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { SlidePage } from '@/app/layouts/SlidePage'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { Megaphone } from 'pixelarticons/react/Megaphone'
import { Bell } from 'pixelarticons/react/Bell'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { makeLocalStorageFlagStore, getServerFlagSnapshotFalse } from '@/shared/utils/localStorageFlag'

// Each toggle below mirrors a localStorage dev flag — read via useSyncExternalStore
// (see makeLocalStorageFlagStore's own doc comment for why an effect-body setState
// isn't the React-idiomatic way to sync from an external store like localStorage).
// nexus_push_diag has no toggle here (Figma 708:18773 dropped it) — Manage
// Notifications below is this screen's sole notification-debug entry point now;
// nexus_push_diag itself is still devtools-only, same as nexus_dev_mode/nexus_chat_camera.
const INFINITE_COINS_STORE = makeLocalStorageFlagStore('nexus_infinite_coins', 'nexus-infinite-coins-change')
const POLL_FEATURE_STORE   = makeLocalStorageFlagStore('nexus_poll_feature',   'nexus-poll-feature-change')
const EVENTS_FEATURE_STORE = makeLocalStorageFlagStore('nexus_events_enabled', 'nexus-events-feature-change')
const FRIENDSHIP_XP_STORE  = makeLocalStorageFlagStore('nexus_friendship_xp',  'nexus-friendship-xp-change')

export interface DeveloperUserSettingsProps {
  initialCoins: number
}

// ─── Section label ("Features") ──────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="font-silkscreen leading-none uppercase whitespace-nowrap" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}>
      {children}
    </p>
  )
}

// ─── Toggle switch — off track uses --color-muted (not --color-border) ──────

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        width: 48,
        height: 28,
        borderRadius: 40,
        background: enabled ? 'var(--color-purple)' : 'var(--color-muted)',
      }}
      aria-checked={enabled}
      role="switch"
    >
      <motion.span
        className="absolute top-[4px] rounded-full pointer-events-none"
        style={{ width: 20, height: 20, background: 'var(--color-primary)' }}
        animate={{ left: enabled ? 24 : 4 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </button>
  )
}

// ─── Toggle row ("toggle-setting" — Medium title, Light description, 8px gap) ─

function DevToggleRow({ title, description, enabled, onChange }: { title: string; description: string; enabled: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center w-full" style={{ gap: 'var(--space-3)' }}>
      <div className="flex-1 min-w-0 flex flex-col leading-[0]" style={{ gap: 'var(--space-3)' }}>
        <p className="font-body font-medium text-secondary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
          {title}
        </p>
        <p className="font-body font-light text-tertiary leading-none" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
          {description}
        </p>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onChange} />
    </div>
  )
}

// ─── Elevated nav row (Figma 708:18773 "Row") — icon + single-line label +
// chevron, filled surface-elevated background. Both Announcements and Manage
// Notifications share this shape now (an earlier revision had Announcements as
// a bare two-line row and only Manage Notifications elevated — Figma unified
// them into one style). ─────────────────────────────────────────────────────

function DevElevatedNavRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full text-left"
      style={{ gap: 'var(--x3)', padding: 'var(--x5)', background: 'var(--color-surface-elevated)', borderRadius: 'var(--x3)' }}
    >
      {icon}
      <p className="font-body font-medium text-primary flex-1 min-w-0" style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}>
        {label}
      </p>
      <ChevronRight style={{ width: 20, height: 20, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
    </button>
  )
}

// ─── DeveloperUserSettings ────────────────────────────────────────────────────

export function DeveloperUserSettings({ initialCoins }: DeveloperUserSettingsProps) {
  const router = useRouter()

  const infiniteCoins = useSyncExternalStore(INFINITE_COINS_STORE.subscribe, INFINITE_COINS_STORE.getSnapshot, getServerFlagSnapshotFalse)
  const pollFeature   = useSyncExternalStore(POLL_FEATURE_STORE.subscribe,   POLL_FEATURE_STORE.getSnapshot,   getServerFlagSnapshotFalse)
  const eventsFeature = useSyncExternalStore(EVENTS_FEATURE_STORE.subscribe, EVENTS_FEATURE_STORE.getSnapshot, getServerFlagSnapshotFalse)
  const friendshipXP  = useSyncExternalStore(FRIENDSHIP_XP_STORE.subscribe,  FRIENDSHIP_XP_STORE.getSnapshot,  getServerFlagSnapshotFalse)

  function toggleInfiniteCoins() {
    const next = !infiniteCoins
    if (next) localStorage.setItem('nexus_infinite_coins', '1')
    else localStorage.removeItem('nexus_infinite_coins')
    window.dispatchEvent(new CustomEvent('nexus-infinite-coins-change', { detail: { on: next } }))
  }

  function togglePollFeature() {
    const next = !pollFeature
    if (next) localStorage.setItem('nexus_poll_feature', '1')
    else localStorage.removeItem('nexus_poll_feature')
    window.dispatchEvent(new CustomEvent('nexus-poll-feature-change', { detail: { on: next } }))
  }

  function toggleEventsFeature() {
    const next = !eventsFeature
    if (next) localStorage.setItem('nexus_events_enabled', '1')
    else localStorage.removeItem('nexus_events_enabled')
    window.dispatchEvent(new CustomEvent('nexus-events-feature-change', { detail: { on: next } }))
  }

  function toggleFriendshipXP() {
    const next = !friendshipXP
    if (next) localStorage.setItem('nexus_friendship_xp', '1')
    else localStorage.removeItem('nexus_friendship_xp')
    window.dispatchEvent(new CustomEvent('nexus-friendship-xp-change', { detail: { on: next } }))
  }

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      <PageHeader title="Developer Settings" />

      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{ gap: 20, paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="flex flex-col w-full" style={{ gap: 'var(--x3)' }}>
          <DevElevatedNavRow
            icon={<Megaphone style={{ width: 16, height: 16, color: 'var(--color-secondary)' }} aria-hidden="true" />}
            label="Announcements"
            onClick={() => router.push('/profile/developer/announcements')}
          />
          <DevElevatedNavRow
            icon={<Bell style={{ width: 16, height: 16, color: 'var(--color-secondary)' }} aria-hidden="true" />}
            label="Manage Notifications"
            onClick={() => router.push('/profile/developer/manage-notifications')}
          />
        </div>

        <SectionLabel>Features</SectionLabel>
        <DevToggleRow
          title="Infinite Coins"
          description={`Balance : ${initialCoins.toLocaleString()} coins`}
          enabled={infiniteCoins}
          onChange={toggleInfiniteCoins}
        />
        <DevToggleRow
          title="Poll Feature"
          description="Show poll creation button in chat input"
          enabled={pollFeature}
          onChange={togglePollFeature}
        />
        <DevToggleRow
          title="Events Feature"
          description="Enable group event creation and calendar in chat"
          enabled={eventsFeature}
          onChange={toggleEventsFeature}
        />
        <DevToggleRow
          title="Friendship XP"
          description="DM and @mention XP, bond progress bar, and toast"
          enabled={friendshipXP}
          onChange={toggleFriendshipXP}
        />
      </div>

    </SlidePage>
  )
}
