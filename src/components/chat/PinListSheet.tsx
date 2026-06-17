'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useChatStore } from '@/store/chatStore'
import type { Message, MessageWithProfile } from '@/types'

function VisibilityToggle({ visible, onChange }: { visible: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="flex items-center gap-1.5 flex-shrink-0"
      aria-label={visible ? 'Hide from banner' : 'Show on banner'}
    >
      <div
        className="relative overflow-hidden flex-shrink-0"
        style={{ width: 32, height: 18, borderRadius: 18, background: visible ? 'var(--color-purple)' : '#27272a', transition: 'background 0.15s' }}
      >
        <motion.span
          className="absolute top-[3px] w-3 h-3 rounded-full bg-white pointer-events-none"
          animate={{ left: visible ? 17 : 3 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      </div>
      <span
        className="font-silkscreen leading-none"
        style={{ fontSize: 'var(--text-mini)', color: visible ? 'var(--color-secondary)' : 'var(--color-tertiary)' }}
      >
        {visible ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

interface PinListSheetProps {
  activePins: Message[]
  currentUserId: string
  creatorId: string | null
  onClose: () => void
}

function formatTimeRemaining(expiresAt: string | null | undefined): string {
  if (!expiresAt) return 'Pinned permanently'
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
        className="fixed bottom-0 left-0 right-0 z-[70] bg-[#0a0612] border-t border-border flex flex-col"
        style={{ maxHeight: '70vh', paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
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
        <div className="px-5 pt-5 pb-4 flex items-center justify-between flex-shrink-0">
          <div className="flex flex-col gap-1">
            <p className="font-pixel text-[8px] text-tertiary leading-none">PINNED TO THE BOARD</p>
            {activePins.length > 0 && (
              <p
                className="font-body font-normal leading-none"
                style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
              >
                {activePins.length} / 5 pinned
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="font-pixel text-[8px] text-tertiary h-10 px-2 flex items-center justify-center"
          >
            CLOSE
          </button>
        </div>

        <div className="border-t border-border flex-shrink-0" />

        {/* Pin list */}
        <div className="flex-1 overflow-y-auto nexus-scroll">
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
            activePins.map((pin) => {
              const profile = (pin as MessageWithProfile).profile
              const username = profile?.username ?? 'Unknown'
              const content  = truncateContent(pin.content)
              const expires  = formatTimeRemaining(pin.pin_expires_at as string | null | undefined)

              return (
                <div key={pin.id} className="border-b border-border/50 last:border-b-0">
                  <button
                    onClick={() => handleScrollTo(pin.id)}
                    className="w-full flex flex-col gap-1 px-5 py-4 text-left active:bg-[#111111] transition-colors"
                  >
                    <p
                      className="font-body font-normal text-primary leading-snug w-full"
                      style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
                    >
                      {content}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-silkscreen leading-none"
                        style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}
                      >
                        @{username}
                      </span>
                      <span
                        className="font-silkscreen leading-none"
                        style={{ fontSize: 'var(--text-mini)', color: 'var(--color-blue)', opacity: 0.8 }}
                      >
                        {expires}
                      </span>
                    </div>
                  </button>

                  {isAdmin && (
                    <div className="px-5 pb-3 flex items-center justify-between">
                      <VisibilityToggle
                        visible={!hiddenPinIds.has(pin.id)}
                        onChange={() => toggleHiddenPin(pin.id)}
                      />
                      <button
                        onClick={() => void handleUnpin(pin.id)}
                        disabled={unpinning === pin.id}
                        className="font-silkscreen leading-none disabled:opacity-40 transition-opacity active:opacity-60"
                        style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}
                      >
                        {unpinning === pin.id ? '...' : 'Unpin'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
