'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useChatStore } from '@/store/chatStore'
import type { Message, MessageWithProfile } from '@/types'

function VisibilityToggle({ visible, onChange }: { visible: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <span
        className="font-body font-medium whitespace-nowrap"
        style={{ fontSize: 12, color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
      >
        Display
      </span>
      <button
        onClick={onChange}
        className="relative flex-shrink-0"
        style={{
          width: 40,
          height: 24,
          borderRadius: 40,
          background: visible ? 'var(--color-purple)' : '#71717a',
          transition: 'background 0.2s',
        }}
        aria-label={visible ? 'Hide from banner' : 'Show on banner'}
      >
        <motion.span
          className="absolute rounded-full bg-white pointer-events-none"
          style={{ top: 4, width: 16, height: 16 }}
          animate={{ left: visible ? 20 : 4 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      </button>
    </div>
  )
}

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
  const hiddenPinIds            = useChatStore((s) => s.hiddenPinIds)
  const toggleHiddenPin         = useChatStore((s) => s.toggleHiddenPin)

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
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border flex flex-col"
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
        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-6 pb-6">
          <p
            className="font-body font-bold leading-none"
            style={{ fontSize: 16, color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}
          >
            Pinned Messages
          </p>
        </div>

        {/* Pin list */}
        <div
          className="flex-1 overflow-y-auto nexus-scroll px-4"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        >
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
            <div className="flex flex-col">
              {activePins.map((pin, idx) => {
                const profile  = (pin as MessageWithProfile).profile
                const username = profile?.username ?? 'Unknown'
                const content  = truncateContent(pin.content)
                const expires  = formatTimeRemaining(pin.pin_expires_at as string | null | undefined)

                return (
                  <div key={pin.id}>
                    {idx > 0 && <div className="h-px bg-border/40" />}
                    <div className="py-3 flex flex-col gap-4">
                      {/* Message content — tappable to scroll */}
                      <button
                        onClick={() => handleScrollTo(pin.id)}
                        className="flex flex-col gap-1 text-left w-full"
                      >
                        <p
                          className="font-body font-medium w-full leading-snug"
                          style={{ fontSize: 14, color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
                        >
                          {content}
                        </p>
                        <p
                          className="font-body font-normal w-full"
                          style={{ fontSize: 12, color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
                        >
                          {`Sent by : @${username} `}
                          <span style={{ color: '#60a5fa' }}>· {expires}</span>
                        </p>
                      </button>

                      {/* Admin action row */}
                      {isAdmin && (
                        <div className="flex items-center justify-between w-full">
                          <button
                            onClick={() => void handleUnpin(pin.id)}
                            disabled={unpinning === pin.id}
                            className="font-body font-medium disabled:opacity-40 transition-opacity"
                            style={{ fontSize: 12, color: 'var(--color-danger)', fontVariationSettings: '"opsz" 14' }}
                          >
                            {unpinning === pin.id ? '…' : 'Unpin message'}
                          </button>
                          <VisibilityToggle
                            visible={!hiddenPinIds.has(pin.id)}
                            onChange={() => toggleHiddenPin(pin.id)}
                          />
                        </div>
                      )}
                    </div>
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
