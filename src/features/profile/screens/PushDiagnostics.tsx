'use client'

import { useState } from 'react'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { forceResubForUserAction } from '@/app/(app)/profile/developer/push-diagnostics/actions'

export interface PushDiagnosticUser {
  id:                 string
  username:           string
  avatarUrl:          string | null
  subscribed:         boolean
  subscriptionCount:  number
  lastSeenAt:         string | null
  subscribedSince:    string | null
  hasApns:            boolean
  hasFcm:             boolean
  osGranted:          'yes' | 'no' | 'unknown'
  swActivated:        'yes' | 'no' | 'unknown'
}

interface PushDiagnosticsProps {
  initialUsers: PushDiagnosticUser[]
}

// Figma 708:18842's mock date ("08/27/26") is numeric MM/DD/YY — no existing
// date helper in the codebase produces that exact shape (formatShortDate gives
// "Jul 27, 2026"), so this is a small local formatter rather than a reused one.
function formatMMDDYY(iso: string): string {
  const d  = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${mm}/${dd}/${yy}`
}

function platformLabel(user: PushDiagnosticUser): string | null {
  if (user.hasApns) return 'iOS'
  if (user.hasFcm)  return 'Android'
  if (user.subscribed) return 'Web'
  return null
}

// One line per real, known issue — drives both the auto-shown per-row console
// block and what gets appended to it live once a refresh is triggered.
function detectIssues(user: PushDiagnosticUser): string[] {
  const issues: string[] = []
  if (!user.subscribed) {
    issues.push('no push_subscriptions row — device has never completed a subscribe')
    return issues
  }
  if (!user.lastSeenAt) {
    issues.push('subscribed but never confirmed alive — no push has round-tripped the heartbeat yet')
  }
  if (user.osGranted === 'no') {
    issues.push('OS permission is not "granted" on at least one subscribed device')
  }
  if (user.swActivated === 'no') {
    issues.push('service worker reported a non-activated state on at least one device')
  }
  if (user.subscriptionCount > 5) {
    issues.push(`${user.subscriptionCount} duplicate endpoints — likely the iOS getSubscription() false-negative bug (see notification-engine skill)`)
  }
  return issues
}

// ─── Header — bare chevron + bold DM Sans title, matches Figma 708:18842's
// "icon + title" node exactly. Not PageHeader's 'default' variant (uppercase
// Silkscreen) or its 'sheet' variant (decorative-only icon, no back button) —
// neither matches this spec, so this follows the same bespoke-header precedent
// as DeveloperUserAnnouncements' list page. Must be its own component so
// useSlideBack() resolves as a descendant of this screen's own SlidePage below,
// not the page.tsx server component above it — see the useSlideBack gotcha in
// CLAUDE.md's Page Structure section.
function PushDiagnosticsHeader() {
  const goBack = useSlideBack()
  return (
    <div
      className="flex-shrink-0 flex items-center"
      style={{ gap: 'var(--x3)', paddingLeft: 'var(--md)', paddingRight: 'var(--md)', paddingTop: 'max(env(safe-area-inset-top), var(--x5))', paddingBottom: 'var(--x5)' }}
    >
      <button onClick={goBack} aria-label="Back" className="flex-shrink-0 flex items-center justify-center" style={{ width: 24, height: 24 }}>
        <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
      </button>
      <h1 className="font-body font-bold leading-none text-primary" style={{ fontSize: 'var(--xl)', fontVariationSettings: '"opsz" 14' }}>
        Notification Subscriptions
      </h1>
    </div>
  )
}

function MetricChip({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  return (
    <div className="flex items-center overflow-clip py-px" style={{ gap: 'var(--x2)', opacity: active ? 1 : 0.4 }}>
      <img src={icon} alt="" className="flex-shrink-0" style={{ width: 12, height: 12 }} />
      <span className={`font-body font-light whitespace-nowrap ${active ? 'text-secondary' : 'text-tertiary'}`} style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}>
        {label}
      </span>
    </div>
  )
}

function UserDiagnosticCard({
  user, log, resubbing, onRefresh,
}: {
  user:      PushDiagnosticUser
  log:       string[]
  resubbing: boolean
  onRefresh: () => void
}) {
  const [copied, setCopied] = useState(false)
  const platform    = platformLabel(user)
  const issues      = detectIssues(user)
  const consoleLines = [...issues.map((i) => `✗ ${i}`), ...log]
  // Falls back to earliest subscribe date when never confirmed alive, rather
  // than showing no date at all.
  const displayDate = user.lastSeenAt ?? user.subscribedSince

  function handleCopy() {
    const text = consoleLines.join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <div className="w-full flex flex-col" style={{ gap: 'var(--x3)' }}>
      <div
        className="w-full flex flex-col justify-center"
        style={{ gap: 'var(--x3)', padding: 'var(--md)', background: 'var(--color-surface-sheet)', borderRadius: 'var(--x3)' }}
      >
        <div className="w-full flex items-center" style={{ gap: 8 }}>
          <UserAvatar avatarUrl={user.avatarUrl} username={user.username} size={32} bg="border" initialColor="primary" />
          <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ gap: 'var(--x1)', height: 37 }}>
            <p className="font-body font-semibold text-primary truncate" style={{ fontSize: 'var(--sm)', letterSpacing: '0.2px', fontVariationSettings: '"opsz" 14' }}>
              {user.username}{displayDate ? ` · ${formatMMDDYY(displayDate)}` : ''}
            </p>
            <div className="flex items-center" style={{ gap: 8 }}>
              <div className="flex items-center overflow-clip py-px" style={{ gap: 'var(--x2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: user.subscribed ? 'var(--green)' : 'var(--red)', flexShrink: 0, display: 'block' }} />
                <span className="font-body font-light text-secondary whitespace-nowrap" style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}>
                  {user.subscribed ? 'Subscribed' : 'Not Subscribed'}
                </span>
              </div>
              {platform && (
                <div className="flex items-center overflow-clip py-px" style={{ gap: 'var(--x2)' }}>
                  <img src="/icons/push-diag/platform.svg" alt="" style={{ width: 12, height: 12 }} />
                  <span className="font-body font-light text-secondary whitespace-nowrap" style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}>
                    {platform}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={resubbing}
            aria-label={`Force resubscribe ${user.username}`}
            className="flex-shrink-0 flex items-center justify-center disabled:opacity-40"
            style={{ width: 20, height: 20 }}
          >
            <img src="/icons/push-diag/refresh.svg" alt="" style={{ width: 18, height: 13 }} className={resubbing ? 'animate-spin' : undefined} />
          </button>
        </div>

        <div className="w-full flex items-center flex-wrap" style={{ gap: 'var(--x3)' }}>
          <MetricChip icon="/icons/push-diag/os-granted.svg"   label="OS Granted"     active={user.osGranted === 'yes'} />
          <MetricChip icon="/icons/push-diag/sw-activated.svg" label="SW · Activated" active={user.swActivated === 'yes'} />
          <MetricChip icon="/icons/push-diag/sub-apns.svg"     label="Sub Apns"       active={user.hasApns} />
          <MetricChip icon="/icons/push-diag/endpoint-count.svg" label={String(user.subscriptionCount)} active={user.subscriptionCount > 0} />
        </div>
      </div>

      {consoleLines.length > 0 && (
        <div className="w-full flex flex-col" style={{ gap: 'var(--x2)', padding: 'var(--x4)', background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 'var(--x3)' }}>
          <div className="w-full flex items-center justify-between">
            <span className="font-body font-medium text-tertiary uppercase" style={{ fontSize: 'var(--xxs)', letterSpacing: '0.4px' }}>Console</span>
            <button onClick={handleCopy} className="font-body font-medium text-purple" style={{ fontSize: 'var(--xxs)' }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex flex-col" style={{ gap: 2 }}>
            {consoleLines.map((line, i) => (
              <p key={i} className="break-all leading-snug text-secondary" style={{ fontSize: 'var(--xs)', fontFamily: 'monospace' }}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function PushDiagnostics({ initialUsers }: PushDiagnosticsProps) {
  const [users,        setUsers]        = useState(initialUsers)
  const [logsByUser,   setLogsByUser]   = useState<Record<string, string[]>>({})
  // A Set, not a single id — refreshing two different rows in quick succession
  // must not clear the first row's spinner just because a second one started.
  const [resubbingIds, setResubbingIds] = useState<Set<string>>(new Set())

  function appendLog(userId: string, line: string) {
    setLogsByUser((prev) => ({ ...prev, [userId]: [...(prev[userId] ?? []), line] }))
  }

  async function handleRefresh(user: PushDiagnosticUser) {
    setResubbingIds((prev) => new Set(prev).add(user.id))
    appendLog(user.id, `→ force resub requested for @${user.username}…`)
    try {
      const result = await forceResubForUserAction(user.id)
      if (result.error) {
        appendLog(user.id, `✗ ${result.error}`)
        return
      }
      appendLog(user.id, `✓ deleted ${result.deletedCount ?? 0} row(s) — resolves next time this device reopens the app`)
      setUsers((prev) => prev.map((u) => u.id === user.id
        ? { ...u, subscribed: false, subscriptionCount: 0, lastSeenAt: null, subscribedSince: null, hasApns: false, hasFcm: false, osGranted: 'unknown', swActivated: 'unknown' }
        : u))
    } catch (err) {
      appendLog(user.id, `✗ ${String(err).slice(0, 120)}`)
    } finally {
      setResubbingIds((prev) => {
        const next = new Set(prev)
        next.delete(user.id)
        return next
      })
    }
  }

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      <PushDiagnosticsHeader />
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{ gap: 'var(--x5)', paddingLeft: 'var(--md)', paddingRight: 'var(--md)', paddingBottom: 'max(env(safe-area-inset-bottom), var(--x5))' }}
      >
        {users.map((user) => (
          <UserDiagnosticCard
            key={user.id}
            user={user}
            log={logsByUser[user.id] ?? []}
            resubbing={resubbingIds.has(user.id)}
            onRefresh={() => handleRefresh(user)}
          />
        ))}
      </div>
    </SlidePage>
  )
}
