'use client'

import { motion } from 'framer-motion'
import { CornerUpLeft } from 'pixelarticons/react/CornerUpLeft'
import { Copy } from 'pixelarticons/react/Copy'
import { Note } from 'pixelarticons/react/Note'

export const QUICK_REACTIONS = ['🔥', '💧', '⚡', '🌿', '🌑', '🔮'] as const

interface ChatSheetReactProps {
  onClose:       () => void
  reactions:     Record<string, string[]>
  currentUserId: string
  onReact:       (emoji: string) => void
  onReply:       () => void
  onCopy:        () => void
  copied:        boolean
  canPin:        boolean
  onOpenPin:     () => void
}

export function ChatSheetReact({
  onClose, reactions, currentUserId,
  onReact, onReply, onCopy, copied, canPin, onOpenPin,
}: ChatSheetReactProps) {
  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="react-backdrop"
        className="fixed inset-0 z-[80] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onTouchStart={(e) => { e.stopPropagation(); onClose() }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        key="react-sheet"
        className="fixed bottom-0 left-0 right-0 z-[90] bg-black border-t border-border"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
      >
        <div className="flex flex-col" style={{ gap: 24, paddingTop: 24, paddingLeft: 16, paddingRight: 16 }}>

          {/* Emoji quick-pick row — 6 circles, justify-between */}
          <div className="flex items-center justify-between w-full" style={{ paddingLeft: 1, paddingRight: 1 }}>
            {QUICK_REACTIONS.map((emoji) => {
              const active = (reactions[emoji] ?? []).includes(currentUserId)
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  className="flex items-center justify-center select-none transition-transform active:scale-90"
                  style={{
                    width:        40,
                    height:       40,
                    borderRadius: '50%',
                    background:   active ? 'var(--color-purple)' : 'var(--color-surface)',
                    fontSize:     20,
                    lineHeight:   1,
                    transform:    active ? 'scale(1.1)' : undefined,
                  }}
                >
                  {emoji}
                </button>
              )
            })}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col w-full" style={{ gap: 16 }}>

            <button
              onClick={onReply}
              className="w-full flex items-center"
              style={{ background: 'var(--color-surface)', borderRadius: 8, padding: 16, gap: 8 }}
            >
              <CornerUpLeft style={{ width: 24, height: 20, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
              <span
                className="flex-1 font-body font-semibold text-secondary leading-normal text-left tracking-[0.2px]"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
              >
                Reply
              </span>
            </button>

            <button
              onClick={onCopy}
              className="w-full flex items-center"
              style={{ background: 'var(--color-surface)', borderRadius: 8, padding: 16, gap: 8 }}
            >
              <Copy style={{ width: 24, height: 20, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
              <span
                className="flex-1 font-body font-semibold text-secondary leading-normal text-left tracking-[0.2px]"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
              >
                {copied ? 'Copied!' : 'Copy Text'}
              </span>
            </button>

            {canPin && (
              <button
                onClick={onOpenPin}
                className="w-full flex items-center"
                style={{ background: 'var(--color-surface)', borderRadius: 8, padding: 16, gap: 8 }}
              >
                <Note style={{ width: 24, height: 20, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
                <span
                  className="flex-1 font-body font-semibold text-secondary leading-normal text-left tracking-[0.2px]"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                >
                  Pin Message
                </span>
              </button>
            )}

          </div>
        </div>
      </motion.div>
    </>
  )
}
