'use client'

import { useState } from 'react'
import { Copy } from 'pixelarticons/react/Copy'
import { Check } from 'pixelarticons/react/Check'

interface InviteCodeCardProps {
  inviteCode: string
  style?: React.CSSProperties
}

// Shared by SquadDetailsSheet's Members section and MessageList's empty state
// (Figma 438:8098 / 426:1996) — same card exactly, just different max-width
// constraints from each call site.
export function InviteCodeCard({ inviteCode, style }: InviteCodeCardProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (copied) return
    navigator.clipboard.writeText(`Come join my squad on Nexus app ${inviteCode}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  return (
    <div
      className="flex items-center justify-between w-full bg-[var(--color-surface)] border border-border"
      style={{ height: 68, padding: 'var(--x5)', ...style }}
    >
      <div className="flex flex-col items-center justify-center font-silkscreen" style={{ gap: 'var(--x2)' }}>
        <p className="leading-none text-primary whitespace-nowrap" style={{ fontSize: 'var(--mini)' }}>
          Invite new members
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
          boxShadow:  '4px 4px 0 rgba(168,85,247,0.5)',
          padding:    'var(--x4) var(--x5)',
          gap:        'var(--x3)',
        }}
      >
        {copied ? (
          <Check style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
        ) : (
          <Copy style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
        )}
        <span className="font-silkscreen leading-none text-primary whitespace-nowrap" style={{ fontSize: 'var(--xxs)' }}>
          {copied ? 'Copied!' : 'Copy Code'}
        </span>
      </button>
    </div>
  )
}
