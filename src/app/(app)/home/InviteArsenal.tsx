'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Coins } from 'pixelarticons/react/Coins'
import { generateAppInviteAction, getInviteCodesAction } from './actions'
import type { InviteCodeData } from './actions'

interface InviteArsenalProps {
  userId:           string
  coins:            number
  infiniteCoins?:   boolean
  onClose:          () => void
  onCoinsDeducted:  () => void
}

export function InviteArsenal({ userId, coins, infiniteCoins, onClose, onCoinsDeducted }: InviteArsenalProps) {
  const [codes,    setCodes]    = useState<InviteCodeData[]>([])
  const [loading,  setLoading]  = useState(true)
  const [forging,  setForging]  = useState(false)
  const [toast,    setToast]    = useState<{ msg: string; color: string } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const showToast = useCallback((msg: string, color: string) => {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const loadCodes = useCallback(async () => {
    const result = await getInviteCodesAction()
    if ('codes' in result) setCodes(result.codes)
    setLoading(false)
  }, [])

  useEffect(() => { loadCodes() }, [loadCodes])

  // Realtime: update list when a code is claimed (requires app_invites in supabase_realtime publication)
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`invite-arsenal:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_invites', filter: `inviter_id=eq.${userId}` },
        () => { loadCodes() },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, loadCodes])

  async function handleForge() {
    if ((!infiniteCoins && coins < 25) || forging) return
    setForging(true)
    try {
      const result = await generateAppInviteAction()
      if ('error' in result) {
        showToast(result.error.includes('coins') ? 'Not enough coins.' : result.error, '#ff4444')
      } else {
        onCoinsDeducted()
        showToast('Code forged.', '#66bb6a')
        await loadCodes()
      }
    } finally {
      setForging(false)
    }
  }

  async function handleCopy(code: string, id: string) {
    await navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const canAfford = infiniteCoins || coins >= 25

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: '#0a0612' }}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-4 pb-4 border-b border-border flex flex-col gap-2"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <button
          onClick={onClose}
          className="self-start flex items-center justify-center min-h-[44px] text-tertiary hover:text-primary transition-colors"
          aria-label="Close"
        >
          <ChevronLeft style={{ width: 24, height: 24 }} aria-hidden="true" />
        </button>

        <h1 className="font-pixel text-[14px] text-primary leading-tight">INVITE ARSENAL</h1>

        <p className="font-body text-[13px] leading-snug" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Spend coins. Recruit warriors.
        </p>

        <div className="flex items-center gap-2 mt-1">
          <Coins style={{ width: 16, height: 16, color: '#ffd700' }} aria-hidden="true" />
          <span className="font-pixel text-[12px]" style={{ color: '#ffd700' }}>
            {infiniteCoins ? '∞' : coins.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Forge button */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2 flex flex-col gap-2">
        <button
          onClick={handleForge}
          disabled={!canAfford || forging}
          className="w-full min-h-[56px] flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-80"
          style={{ background: canAfford ? '#bf5fff' : 'rgba(255,255,255,0.1)' }}
        >
          <span
            className="font-pixel text-[10px] leading-tight"
            style={{ color: canAfford ? '#ffffff' : 'rgba(255,255,255,0.4)' }}
          >
            {forging ? '...' : 'FORGE INVITE CODE'}
          </span>
          <span
            className="font-body text-[11px]"
            style={{ color: canAfford ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)' }}
          >
            25 coins
          </span>
        </button>

        {!canAfford && (
          <p
            className="font-body text-[12px] text-center"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Keep fighting to earn more coins.
          </p>
        )}
      </div>

      {/* Code list */}
      <div
        className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
      >
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <span className="font-pixel text-[8px] text-muted">Loading...</span>
          </div>
        ) : codes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <Coins
              style={{ width: 32, height: 32, color: 'rgba(255,255,255,0.2)' }}
              aria-hidden="true"
            />
            <p
              className="font-pixel text-[8px] text-center leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              No codes forged yet.
            </p>
            <p
              className="font-body text-[13px] text-center"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Spend 25 coins to recruit a warrior.
            </p>
          </div>
        ) : (
          codes.map((invite) => (
            <InviteCodeCard
              key={invite.id}
              invite={invite}
              copiedId={copiedId}
              onCopy={handleCopy}
            />
          ))
        )}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[70] px-5 py-2 font-body text-[13px] font-semibold whitespace-nowrap"
            style={{
              color:      toast.color,
              background: 'rgba(10,6,18,0.95)',
              border:     `1px solid ${toast.color}50`,
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function InviteCodeCard({
  invite,
  copiedId,
  onCopy,
}: {
  invite:   InviteCodeData
  copiedId: string | null
  onCopy:   (code: string, id: string) => void
}) {
  const isUsed   = invite.used
  const isCopied = copiedId === invite.id

  const formattedDate = (() => {
    try {
      return new Date(invite.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day:   'numeric',
        year:  'numeric',
      })
    } catch {
      return ''
    }
  })()

  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{
        background:   isUsed ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
        border:       isUsed ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
      }}
    >
      {/* Top row: code + status badge */}
      <div className="flex items-center justify-between gap-3">
        <span
          className="font-pixel text-[13px] tracking-[0.2em] flex-1 min-w-0 break-all"
          style={{ color: isUsed ? 'rgba(255,255,255,0.4)' : '#ffffff' }}
        >
          {invite.code}
        </span>

        {isUsed ? (
          <span
            className="flex-shrink-0 font-body text-[10px] font-bold px-2 py-1"
            style={{
              background:   'rgba(255,255,255,0.05)',
              border:       '1px solid rgba(255,255,255,0.2)',
              color:        'rgba(255,255,255,0.4)',
              borderRadius: 2,
            }}
          >
            USED
          </span>
        ) : (
          <span
            className="flex-shrink-0 font-body text-[10px] font-bold px-2 py-1"
            style={{
              background:   'rgba(191,95,255,0.15)',
              border:       '1px solid #bf5fff',
              color:        '#bf5fff',
              borderRadius: 2,
            }}
          >
            UNUSED
          </span>
        )}
      </div>

      {/* Bottom row: date + copy / claimed-by */}
      <div className="flex items-center justify-between gap-3">
        <span
          className="font-body text-[12px]"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {formattedDate}
        </span>

        {isUsed ? (
          <span
            className="font-body text-[12px] text-right"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {invite.used_by_username ? `Claimed by ${invite.used_by_username}` : 'Claimed'}
          </span>
        ) : (
          <button
            onClick={() => onCopy(invite.code, invite.id)}
            className="min-h-[44px] px-4 flex items-center font-body text-[12px] font-semibold transition-colors"
            style={{
              background:   'transparent',
              border:       `1px solid ${isCopied ? '#66bb6a' : '#bf5fff'}`,
              color:        isCopied ? '#66bb6a' : '#bf5fff',
              borderRadius: 2,
            }}
          >
            {isCopied ? 'Copied!' : 'Copy Code'}
          </button>
        )}
      </div>
    </div>
  )
}
