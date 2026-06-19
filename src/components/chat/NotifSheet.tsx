'use client'

import { motion } from 'framer-motion'

export type NotifPrefs = { messages: boolean; raids: boolean; victory: boolean; mentions: boolean }

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
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        className="relative w-full max-w-[480px] bg-black border-t border-border flex flex-col overflow-hidden"
        style={{ gap: 24, paddingTop: 24, paddingLeft: 16, paddingRight: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 4 }}>
          <h2
            className="font-body font-bold leading-none"
            style={{ fontSize: 16, color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}
          >
            Notifications
          </h2>
          <p
            className="font-body font-normal leading-normal"
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
            label="Raid Alerts"
            description="Notify me when boss spawns and expires"
            enabled={prefs.raids}
            onToggle={() => onToggle('raids')}
          />
          <div className="border-t border-border w-full" />
          <NotifToggleRow
            label="Victory"
            description="Notify me when boss defeated & artifact drops"
            enabled={prefs.victory}
            onToggle={() => onToggle('victory')}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}
