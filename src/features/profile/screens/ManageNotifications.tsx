'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Trash } from 'pixelarticons/react/Trash'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { Button } from '@/shared/components/ui/Button'
import { BottomSheet } from '@/shared/components/ui/sheet/BottomSheet'
import { forceResubForUserAction, adminDeleteUserAction } from '@/app/(app)/profile/developer/manage-notifications/actions'

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

interface ManageNotificationsProps {
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
    issues.push('never subscribed')
    return issues
  }
  if (!user.lastSeenAt) {
    issues.push('not yet confirmed alive')
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
function ManageNotificationsHeader() {
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
        Manage Notifications
      </h1>
    </div>
  )
}

// ─── Push-diag glyphs, inlined (not `<img src="...svg">`) ────────────────────
// Every one of these files is `fill="currentColor"` — but an externally
// referenced <img> can't inherit CSS `color` from the page (same gotcha as
// the SheetActionButton note in CLAUDE.md), so loading them that way silently
// stripped their intended color no matter what wrapped them. Inlining the
// exact same path data as real SVG markup lets `currentColor` resolve from
// whatever `color` the wrapping element sets, matching Figma 708:18911.
function RefreshIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg width="18" height="13" viewBox="0 0 18.3333 13.3333" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M10 13.3333H6.66667V11.6667H10V13.3333ZM15 10H16.6667V11.6667H15V13.3333H13.3333V11.6667H11.6667V10H13.3333V3.33333H15V10ZM6.66667 11.6667H5V10H6.66667V11.6667ZM5 1.66667H6.66667V3.33333H5V10H3.33333V3.33333H1.66667V1.66667H3.33333V0H5V1.66667ZM11.6667 10H10V8.33333H11.6667V10ZM18.3333 10H16.6667V8.33333H18.3333V10ZM1.66667 5H0V3.33333H1.66667V5ZM8.33333 5H6.66667V3.33333H8.33333V5ZM13.3333 3.33333H11.6667V1.66667H13.3333V3.33333ZM11.6667 1.66667H8.33333V0H11.6667V1.66667Z" />
    </svg>
  )
}

function OsGrantedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M1.81818 10H0.909091V9.09091H1.81818V10ZM5.45455 10H4.54545V8.18182H5.45455V10ZM0.909091 9.09091H0V8.18182H0.909091V9.09091ZM2.72727 9.09091H1.81818V8.18182H2.72727V9.09091ZM1.81818 8.18182H0.909091V7.27273H1.81818V8.18182ZM4.54545 8.18182H3.63636V6.36364H4.54545V8.18182ZM6.36364 8.18182H5.45455V6.36364H6.36364V8.18182ZM3.63636 6.36364H1.81818V5.45455H3.63636V6.36364ZM8.18182 6.36364H6.36364V5.45455H8.18182V6.36364ZM1.81818 5.45455H0V4.54545H1.81818V5.45455ZM10 5.45455H8.18182V4.54545H10V5.45455ZM3.63636 4.54545H1.81818V3.63636H3.63636V4.54545ZM8.18182 4.54545H6.36364V3.63636H8.18182V4.54545ZM4.54545 3.63636H3.63636V1.81818H4.54545V3.63636ZM6.36364 3.63636H5.45455V1.81818H6.36364V3.63636ZM9.09091 0.909091H10V1.81818H9.09091V2.72727H8.18182V1.81818H7.27273V0.909091H8.18182V0H9.09091V0.909091ZM5.45455 1.81818H4.54545V0H5.45455V1.81818Z" />
    </svg>
  )
}

function SwActivatedIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 8 10" fill="currentColor" aria-hidden="true">
      <path d="M7 10H1V9H7V10ZM1 9H0V1H1V9ZM6 1H5V3H7V2H8V9H7V4H4V1H1V0H6V1ZM7 2H6V1H7V2Z" />
    </svg>
  )
}

function SubApnsIcon() {
  return (
    <svg width="12" height="11" viewBox="0 0 10 9" fill="currentColor" aria-hidden="true">
      <path d="M1 8H3V9H0V5H1V8ZM5 8H3V7H5V8ZM7 7H5V6H7V7ZM9 6H7V5H9V6ZM4 5H1V4H4V5ZM10 5H9V4H10V5ZM3 1H1V4H0V0H3V1ZM9 4H7V3H9V4ZM7 3H5V2H7V3ZM5 2H3V1H5V2Z" />
    </svg>
  )
}

function EndpointCountIcon() {
  return (
    <svg width="12" height="7" viewBox="0 0 10 6" fill="currentColor" aria-hidden="true">
      <path d="M4.5 6H1V5H4.5V6ZM9 6H5.5V5H9V6ZM1 5H0V1H1V5ZM10 5H9V1H10V5ZM7.5 3.5H2.5V2.5H7.5V3.5ZM4.5 1H1V0H4.5V1ZM9 1H5.5V0H9V1Z" />
    </svg>
  )
}

function PlatformIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 8 10" fill="currentColor" aria-hidden="true">
      <path d="M1 10H0V8H1V10ZM8 10H7V8H8V10ZM2 8H1V7H2V8ZM7 8H6V7H7V8ZM6 7H2V6H6V7ZM5.5 5H2.5V4H5.5V5ZM2.5 4H1.5V1H2.5V4ZM6.5 4H5.5V1H6.5V4ZM5.5 1H2.5V0H5.5V1Z" />
    </svg>
  )
}

// Icon + label share one `color` on the wrapping div — Figma pairs each metric
// glyph with a label in the same secondary/tertiary tone, and setting color
// once here (rather than on each child) is what lets the inline SVG's
// `currentColor` and the label's text both resolve it via inheritance.
function MetricChip({ icon, label, active }: { icon: ReactNode; label: string; active: boolean }) {
  return (
    <div
      className="flex items-center overflow-clip py-px"
      style={{ gap: 'var(--x2)', opacity: active ? 1 : 0.4, color: active ? 'var(--color-secondary)' : 'var(--color-tertiary)' }}
    >
      <span className="flex-shrink-0 flex items-center justify-center" style={{ width: 12, height: 12 }}>
        {icon}
      </span>
      <span className="font-body font-light whitespace-nowrap" style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}>
        {label}
      </span>
    </div>
  )
}

// ─── Remove User confirm sheet (Figma 740:19299) ─────────────────────────────

function RemoveUserSheet({
  username, deleting, error, onConfirm, onClose,
}: {
  username:  string
  deleting:  boolean
  error:     string | null
  onConfirm: () => void
  onClose:   () => void
}) {
  return (
    <BottomSheet onClose={onClose} zIndex={90} disableDrag={deleting}>
      <div
        className="flex flex-col w-full"
        style={{ gap: 'var(--x6)', paddingLeft: 'var(--md)', paddingRight: 'var(--md)', paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))' }}
      >
        <div className="flex flex-col w-full" style={{ gap: 'var(--x2)' }}>
          <p className="font-body font-bold leading-none w-full" style={{ fontSize: 'var(--md)', color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}>
            Remove User Completely?
          </p>
          <p className="font-body font-light leading-[1.4] w-full" style={{ fontSize: 'var(--xs)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}>
            This will permanently remove @{username} and all of their data from the app.
          </p>
          {error && (
            <p className="font-body font-light leading-[1.4] w-full" style={{ fontSize: 'var(--xs)', color: 'var(--red)' }}>
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-col w-full" style={{ gap: 'var(--x5)' }}>
          <Button variant="outlined" color="red" onClick={onConfirm} loading={deleting} className="w-full">
            Remove Permanently
          </Button>
          <Button variant="outlined" color="tertiary" onClick={onClose} disabled={deleting} className="w-full">
            Never mind
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

function UserDiagnosticCard({
  user, log, resubbing, deleting, onRefresh, onRequestRemove,
}: {
  user:            PushDiagnosticUser
  log:             string[]
  resubbing:       boolean
  deleting:        boolean
  onRefresh:       () => void
  onRequestRemove: () => void
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
                <div className="flex items-center overflow-clip py-px" style={{ gap: 'var(--x2)', color: 'var(--color-secondary)' }}>
                  <span className="flex-shrink-0 flex items-center justify-center" style={{ width: 12, height: 12 }}>
                    <PlatformIcon />
                  </span>
                  <span className="font-body font-light whitespace-nowrap" style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}>
                    {platform}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center" style={{ gap: 'var(--x5)' }}>
            <button
              onClick={onRefresh}
              disabled={resubbing || deleting}
              aria-label={`Force resubscribe ${user.username}`}
              className="flex-shrink-0 flex items-center justify-center disabled:opacity-40"
              style={{ width: 20, height: 20 }}
            >
              <RefreshIcon style={{ color: 'var(--color-primary)' }} className={resubbing ? 'animate-spin' : undefined} />
            </button>
            <button
              onClick={onRequestRemove}
              disabled={deleting}
              aria-label={`Remove ${user.username} permanently`}
              className="flex-shrink-0 flex items-center justify-center disabled:opacity-40"
              style={{ width: 20, height: 20 }}
            >
              <Trash style={{ width: 18, height: 18, color: 'var(--red)' }} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="w-full flex items-center flex-wrap" style={{ gap: 'var(--x3)' }}>
          <MetricChip icon={<OsGrantedIcon />}     label="OS Granted"     active={user.osGranted === 'yes'} />
          <MetricChip icon={<SwActivatedIcon />}   label="SW · Activated" active={user.swActivated === 'yes'} />
          <MetricChip icon={<SubApnsIcon />}       label="Sub Apns"       active={user.hasApns} />
          <MetricChip icon={<EndpointCountIcon />} label={String(user.subscriptionCount)} active={user.subscriptionCount > 0} />
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

export function ManageNotifications({ initialUsers }: ManageNotificationsProps) {
  const [users,        setUsers]        = useState(initialUsers)
  const [logsByUser,   setLogsByUser]   = useState<Record<string, string[]>>({})
  // A Set, not a single id — refreshing two different rows in quick succession
  // must not clear the first row's spinner just because a second one started.
  const [resubbingIds, setResubbingIds] = useState<Set<string>>(new Set())
  const [removeTarget, setRemoveTarget] = useState<PushDiagnosticUser | null>(null)
  const [removingId,   setRemovingId]   = useState<string | null>(null)
  const [removeError,  setRemoveError]  = useState<string | null>(null)

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

  function requestRemove(user: PushDiagnosticUser) {
    setRemoveError(null)
    setRemoveTarget(user)
  }

  async function handleConfirmRemove() {
    if (!removeTarget) return
    setRemovingId(removeTarget.id)
    setRemoveError(null)
    try {
      const result = await adminDeleteUserAction(removeTarget.id)
      if (result.error) {
        setRemoveError(result.error)
        return
      }
      setUsers((prev) => prev.filter((u) => u.id !== removeTarget.id))
      setRemoveTarget(null)
    } catch (err) {
      setRemoveError(String(err).slice(0, 200))
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      <ManageNotificationsHeader />
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
            deleting={removingId === user.id}
            onRefresh={() => handleRefresh(user)}
            onRequestRemove={() => requestRemove(user)}
          />
        ))}
      </div>

      {removeTarget && (
        <RemoveUserSheet
          username={removeTarget.username}
          deleting={removingId === removeTarget.id}
          error={removeError}
          onConfirm={handleConfirmRemove}
          onClose={() => { if (removingId) return; setRemoveTarget(null); setRemoveError(null) }}
        />
      )}
    </SlidePage>
  )
}
