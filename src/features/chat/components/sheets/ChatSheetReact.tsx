'use client'

import { CornerUpLeft } from 'pixelarticons/react/CornerUpLeft'
import { Copy } from 'pixelarticons/react/Copy'
import { Note } from 'pixelarticons/react/Note'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { BottomSheet } from '@/shared/components/ui/BottomSheet'

export const QUICK_REACTIONS = ['🔥', '💧', '⚡', '🌿', '🌑', '🔮'] as const

interface ChatSheetReactProps {
  onClose:       () => void
  reactions:     Record<string, string[]>
  currentUserId: string
  onReact:       (emoji: string) => void
  onReply:       () => void
  onEdit?:       () => void
  isOwn?:        boolean
  onCopy:        () => void
  copied:        boolean
  canPin:        boolean
  onOpenPin:     () => void
}

export function ChatSheetReact({
  onClose, reactions, currentUserId,
  onReact, onReply, onEdit, isOwn, onCopy, copied, canPin, onOpenPin,
}: ChatSheetReactProps) {
  return (
    <BottomSheet onClose={onClose} zIndex={90} dismissOnPointerDown>
      <div className="flex flex-col" style={{ gap: 16, paddingLeft: 16, paddingRight: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}>

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
                  background:   active ? 'var(--color-purple)' : 'var(--color-surface-elevated)',
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

          {isOwn && onEdit && (
            <button
              onClick={onEdit}
              className="w-full flex items-center"
              style={{ background: 'var(--color-surface-elevated)', borderRadius: 8, padding: 16, gap: 8 }}
            >
              <MagicEdit style={{ width: 20, height: 20, color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
              <span
                className="flex-1 font-body font-semibold text-primary leading-normal text-left tracking-[0.2px]"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
              >
                Edit Message
              </span>
            </button>
          )}

          <button
            onClick={onReply}
            className="w-full flex items-center"
            style={{ background: 'var(--color-background)', borderRadius: 8, padding: 16, gap: 8 }}
          >
            <CornerUpLeft style={{ width: 20, height: 20, color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
            <span
              className="flex-1 font-body font-semibold text-primary leading-normal text-left tracking-[0.2px]"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            >
              Reply
            </span>
          </button>

          <button
            onClick={onCopy}
            className="w-full flex items-center"
            style={{ background: 'var(--color-background)', borderRadius: 8, padding: 16, gap: 8 }}
          >
            <Copy style={{ width: 20, height: 20, color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
            <span
              className="flex-1 font-body font-semibold text-primary leading-normal text-left tracking-[0.2px]"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            >
              {copied ? 'Copied!' : 'Copy Text'}
            </span>
          </button>

          {canPin && (
            <button
              onClick={onOpenPin}
              className="w-full flex items-center"
              style={{ background: 'var(--color-surface-elevated)', borderRadius: 8, padding: 16, gap: 8 }}
            >
              <Note style={{ width: 20, height: 20, color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
              <span
                className="flex-1 font-body font-semibold text-primary leading-normal text-left tracking-[0.2px]"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
              >
                Pin Message
              </span>
            </button>
          )}

        </div>
      </div>
    </BottomSheet>
  )
}
