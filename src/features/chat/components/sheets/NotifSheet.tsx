'use client'

import { motion } from 'framer-motion'
import { BottomSheet } from '@/shared/components/ui/BottomSheet'

export type NotifPrefs = { messages: boolean; mentions: boolean; replies: boolean }

export function NotifToggleRow({
  label,
  description,
  enabled,
  onToggle,
}: {
  label:       string
  description: string
  enabled:     boolean
  onToggle:    () => void
}) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <div className="flex-1 min-w-0 flex flex-col" style={{ letterSpacing: '0.2px' }}>
        <p
          className="font-body font-semibold leading-normal"
          style={{ fontSize: 14, color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
        >
          {label}
        </p>
        <p
          className="font-body font-normal leading-normal"
          style={{ fontSize: 12, color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
        >
          {description}
        </p>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? 'Disable' : 'Enable'} ${label} notifications`}
        className="relative flex-shrink-0"
        style={{ width: 48, height: 28, borderRadius: 40, background: enabled ? 'var(--color-purple)' : 'var(--color-muted)', transition: 'background 0.2s' }}
      >
        <motion.span
          className="absolute rounded-full bg-white pointer-events-none"
          style={{ top: 4, width: 20, height: 20 }}
          animate={{ left: enabled ? 24 : 4 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      </button>
    </div>
  )
}

export function NotifSheet({
  prefs,
  onToggle,
  onClose,
}: {
  prefs:    NotifPrefs
  onToggle: (type: keyof NotifPrefs) => void
  onClose:  () => void
}) {
  return (
    <BottomSheet onClose={onClose} zIndex={80}>
      <div className="flex flex-col" style={{ gap: 16, paddingLeft: 16, paddingRight: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}>
        {/* Header */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 4 }}>
          <h2
            className="font-body font-bold leading-none"
            style={{ fontSize: 16, color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}
          >
            Notifications
          </h2>
          <p
            className="font-body font-light leading-none"
            style={{ fontSize: 12, color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
          >
            Control what pulls you back into the chat.
          </p>
        </div>

        {/* Toggle rows */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 16 }}>
          <NotifToggleRow
            label="Messages"
            description="Notify me with new messages from this chat"
            enabled={prefs.messages}
            onToggle={() => onToggle('messages')}
          />
          <div className="border-t border-border w-full" />
          <NotifToggleRow
            label="@Mentions"
            description="Notify me when someone mentions me by name"
            enabled={prefs.mentions}
            onToggle={() => onToggle('mentions')}
          />
          <div className="border-t border-border w-full" />
          <NotifToggleRow
            label="Replies"
            description="Notify me when someone replies to my message"
            enabled={prefs.replies}
            onToggle={() => onToggle('replies')}
          />
        </div>
      </div>
    </BottomSheet>
  )
}
