'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createClient } from '@/shared/supabase/client'
import { useChatStore } from '@/store/chatStore'
import type { Message, MessageWithProfile } from '@/types'


interface PinListSheetProps {
  activePins: Message[]
  currentUserId: string
  creatorId: string | null
  onClose: () => void
}

function formatTimeRemaining(expiresAt: string | null | undefined): string {
  if (!expiresAt) return 'Pinned Permanently'
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `Fades in ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Fades in ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `Fades in ${days}d`
}

function truncateContent(content: string, maxLen = 100): string {
  if (content.startsWith('POLL:') || content.startsWith('BIRTHDAY:') || content.startsWith('JOIN:')) {
    return '[system message]'
  }
  return content.length > maxLen ? content.slice(0, maxLen) + '…' : content
}

export function PinListSheet({ activePins, currentUserId, creatorId, onClose }: PinListSheetProps) {
  const [unpinning, setUnpinning] = useState<string | null>(null)
  const updateMessage           = useChatStore((s) => s.updateMessage)
  const setPinnedScrollTargetId = useChatStore((s) => s.setPinnedScrollTargetId)

  const isAdmin = creatorId != null && currentUserId === creatorId

  async function handleUnpin(messageId: string) {
    if (unpinning) return
    setUnpinning(messageId)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('unpin_message', { p_message_id: messageId })
      if (!error) {
        updateMessage(messageId, {
          pinned:         false,
          pinned_by:      null,
          pinned_at:      null,
          pin_expires_at: null,
        })
      }
    } finally {
      setUnpinning(null)
    }
  }

  function handleScrollTo(messageId: string) {
    setPinnedScrollTargetId(messageId)
    onClose()
  }

  return (
    <AnimatePresence>
      <motion.div
        key="pinlist-backdrop"
        className="fixed inset-0 z-[65] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        key="pinlist-sheet"
        className="fixed bottom-0 left-0 right-0 z-[70] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col"
        style={{ maxHeight: '70vh' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
          style={{ gap: 24, paddingTop: 'var(--space-7)', paddingLeft: 16, paddingRight: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        >
          {/* Header */}
          <p
            className="font-body font-bold leading-none flex-shrink-0"
            style={{ fontSize: 16, color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}
          >
            Pinned Messages
          </p>

          {/* Pin list */}
          {activePins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <span className="font-pixel text-[8px] text-tertiary leading-none">NO PINS YET</span>
              <p
                className="font-body font-normal text-center"
                style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
              >
                Long-press a message to pin it.
              </p>
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 24 }}>
              {activePins.map((pin) => {
                const profile  = (pin as MessageWithProfile).profile
                const username = profile?.username ?? 'Unknown'
                const content  = truncateContent(pin.content)
                const expires  = formatTimeRemaining(pin.pin_expires_at as string | null | undefined)

                return (
                  <div
                    key={pin.id}
                    className="flex flex-col flex-shrink-0 w-full"
                    style={{ background: 'var(--color-surface)', borderRadius: 8, padding: 16, gap: 16 }}
                  >
                    {/* Message content — tappable to scroll */}
                    <button
                      onClick={() => handleScrollTo(pin.id)}
                      className="flex flex-col text-left w-full"
                      style={{ gap: 4 }}
                    >
                      <p
                        className="font-body font-medium w-full"
                        style={{ fontSize: 14, color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14', lineHeight: 'normal', letterSpacing: '0.2px' }}
                      >
                        {content}
                      </p>
                      <p
                        className="font-body font-normal w-full"
                        style={{ fontSize: 12, color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14', lineHeight: 'normal', letterSpacing: '0.2px' }}
                      >
                        {`Sent by : @${username} `}
                        <span style={{ color: 'var(--color-blue)' }}>· {expires}</span>
                      </p>
                    </button>

                    {/* Action row — admin only */}
                    {isAdmin && (
                      <button
                        onClick={() => void handleUnpin(pin.id)}
                        disabled={unpinning === pin.id}
                        className="font-body font-medium disabled:opacity-40 transition-opacity self-start"
                        style={{ fontSize: 12, color: 'var(--color-danger)', fontVariationSettings: '"opsz" 14', letterSpacing: '0.2px', lineHeight: 'normal' }}
                      >
                        {unpinning === pin.id ? '…' : 'Unpin message'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
