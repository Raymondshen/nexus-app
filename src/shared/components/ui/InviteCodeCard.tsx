'use client'

import { useState } from 'react'
import { Copy } from 'pixelarticons/react/Copy'
import { Check } from 'pixelarticons/react/Check'

interface InviteCodeCardProps {
  inviteCode: string
  style?: React.CSSProperties
  /** `'bordered'` (default, Figma 438:8098) — MessageList's empty state: bordered
   *  surface box, fixed 68px height, drop-shadow copy button with icon, "Invite new
   *  members" label. `'inline'` (Figma 674:14743) — ChatRoomBrowseSheet's Current
   *  Squad Information hero: no border/background/shadow (the row sits directly in
   *  the hero card's own surface + padding), no copy icon, intrinsic height, and a
   *  shorter "invite a member" label. These two diverged in Figma; the flag keeps
   *  one shared component instead of a near-duplicate second one. */
  variant?: 'bordered' | 'inline'
}

// Shared by ChatRoomBrowseSheet's Current Squad Information hero and MessageList's
// empty state (Figma 674:14743 / 438:8098) — same underlying card, `variant` picks
// which of the two Figma treatments to render (see the prop doc above).
export function InviteCodeCard({ inviteCode, style, variant = 'bordered' }: InviteCodeCardProps) {
  const [copied, setCopied] = useState(false)
  const inline = variant === 'inline'

  function handleCopy() {
    if (copied) return
    navigator.clipboard.writeText(`Come join my squad on Nexus app ${inviteCode}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  return (
    <div
      className={`flex items-center justify-between w-full ${inline ? '' : 'bg-[var(--color-surface)] border border-purple'}`}
      style={{ height: inline ? undefined : 68, padding: inline ? 0 : 'var(--x5)', ...style }}
    >
      <div className="flex flex-col items-center justify-center font-silkscreen" style={{ gap: 'var(--x2)' }}>
        <p className="leading-none text-primary whitespace-nowrap" style={{ fontSize: 'var(--mini)' }}>
          {inline ? 'invite a member' : 'Invite new members'}
        </p>
        <p
          className="leading-none bg-clip-text text-transparent whitespace-nowrap"
          style={{
            fontSize:        'var(--xl)',
            letterSpacing:   '0.2px',
            backgroundImage: 'linear-gradient(90deg, #a855f7, #d946ef)',
            textShadow:      '0 0 3px #a855f7',
          }}
        >
          {inviteCode}
        </p>
      </div>

      <button
        onClick={handleCopy}
        className="flex items-center justify-center flex-shrink-0 appearance-none transition-opacity active:opacity-80"
        style={{
          background: 'var(--color-purple)',
          boxShadow:  inline ? undefined : '4px 4px 0 rgba(168,85,247,0.5)',
          padding:    'var(--x4) var(--x5)',
          gap:        'var(--x3)',
        }}
      >
        {!inline && (copied ? (
          <Check style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
        ) : (
          <Copy style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
        ))}
        <span className="font-silkscreen leading-none text-primary whitespace-nowrap" style={{ fontSize: 'var(--xxs)' }}>
          {copied ? 'Copied!' : 'Copy Code'}
        </span>
      </button>
    </div>
  )
}
