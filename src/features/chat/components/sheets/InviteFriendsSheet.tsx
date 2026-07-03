'use client'

import { useState } from 'react'
import { BottomSheet } from '@/shared/components/ui/BottomSheet'
import { Copy } from 'pixelarticons/react/Copy'
import { Check } from 'pixelarticons/react/Check'

interface InviteFriendsSheetProps {
  inviteCode: string
  onClose:    () => void
}

// Figma 394:9180
export function InviteFriendsSheet({ inviteCode, onClose }: InviteFriendsSheetProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (copied) return
    navigator.clipboard.writeText(`Come join my squad on Nexus app ${inviteCode}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  return (
    <BottomSheet onClose={onClose} zIndex={80}>
      <div
        className="flex flex-col items-center w-full"
        style={{
          gap:           'var(--x5)',
          paddingLeft:   'var(--md)',
          paddingRight:  'var(--md)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
        }}
      >
        {/* Header */}
        <div className="flex flex-col w-full" style={{ gap: 'var(--x2)' }}>
          <p className="font-body font-bold leading-none text-primary" style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}>
            Invite Friends
          </p>
          <p className="font-body font-light leading-none text-tertiary" style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}>
            Use this code to invite friends to your squad.
          </p>
        </div>

        {/* Code card */}
        <div
          className="flex items-center justify-between w-full bg-[var(--color-surface)] border border-border"
          style={{ height: 68, padding: 'var(--x5)' }}
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
      </div>
    </BottomSheet>
  )
}
