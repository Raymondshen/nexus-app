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
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0 flex flex-col tracking-[0.2px]">
        <p className="font-body font-medium text-[length:var(--text-sm)] text-secondary leading-normal">{label}</p>
        <p className="font-body text-[length:var(--text-xs)] text-tertiary leading-normal">{description}</p>
      </div>
      <button
        onClick={onToggle}
        aria-label={`${enabled ? 'Disable' : 'Enable'} ${label} notifications`}
        className="relative w-[40px] h-[24px] flex-shrink-0 p-1 transition-colors"
        style={{ background: enabled ? 'var(--color-purple)' : '#27272a' }}
      >
        <motion.span
          className="absolute top-1 w-4 h-4 bg-white pointer-events-none"
          animate={{ left: enabled ? 20 : 4 }}
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
      className="fixed inset-0 z-[60] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{   y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="relative w-full max-w-[480px] bg-surface border-t border-border-hover flex flex-col gap-6 p-4 overflow-hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-body font-bold text-[length:var(--text-lg)] text-primary leading-none">Notifications</h2>
          <p className="font-body text-[length:var(--text-xs)] text-secondary leading-normal">Control what pulls you back into the chat.</p>
        </div>

        <div className="flex flex-col gap-3">
          <NotifToggleRow
            label="Messages"
            description="Notify me with new messages from this chat"
            enabled={prefs.messages}
            onToggle={() => onToggle('messages')}
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
          <div className="border-t border-border w-full" />
          <NotifToggleRow
            label="@Mentions"
            description="Notify me when someone mentions me by name"
            enabled={prefs.mentions}
            onToggle={() => onToggle('mentions')}
          />
        </div>

        <button
          onClick={onClose}
          className="w-full h-[var(--space-13)] flex items-center justify-center font-pixel text-[length:var(--text-mini)] text-tertiary leading-none overflow-hidden transition-colors active:text-muted"
        >
          CLOSE
        </button>
      </motion.div>
    </motion.div>
  )
}
