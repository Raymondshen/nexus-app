'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Copy } from 'pixelarticons/react/Copy'
import { Check } from 'pixelarticons/react/Check'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { useChatStore } from '@/store/chatStore'
import { generateAppInviteAction, getInviteCodesAction } from './actions'
import type { InviteCodeData } from './actions'

interface InvitePageProps {
  userId:       string
  initialCoins: number
}

function BackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex-shrink-0 flex items-center"
      style={{ gap: 8 }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
      <span
        className="font-silkscreen text-primary leading-none uppercase"
        style={{ fontSize: 'var(--text-xxl, 24px)' }}
      >
        Invite Code
      </span>
    </button>
  )
}

export function InvitePage({ userId, initialCoins }: InvitePageProps) {
  const [codes,         setCodes]         = useState<InviteCodeData[]>([])
  const [loading,       setLoading]       = useState(true)
  const [forging,       setForging]       = useState(false)
  const [toast,         setToast]         = useState<{ msg: string; color: string } | null>(null)
  const [copiedId,      setCopiedId]      = useState<string | null>(null)
  const [coins,         setCoins]         = useState(initialCoins)
  const [infiniteCoins, setInfiniteCoins] = useState(false)

  useEffect(() => {
    setInfiniteCoins(localStorage.getItem('nexus_infinite_coins') === '1')
  }, [])

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
        const newCoins = coins - 25
        setCoins(newCoins)
        useChatStore.getState().setUserCoins(newCoins)
        showToast('Code generated.', '#66bb6a')
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

  const sortedCodes = [...codes].sort((a, b) => Number(a.used) - Number(b.used))

  return (
    <SlidePage className="min-h-screen bg-black flex flex-col">

      {/* ── Header ── */}
      <div
        className="flex-shrink-0 bg-black px-4"
        style={{
          paddingTop:    'max(env(safe-area-inset-top), 8px)',
          paddingBottom: 'var(--space-3)',
        }}
      >
        <div className="flex items-center h-10">
          <BackButton />
        </div>
      </div>

      {/* ── Scrollable code list ── */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll px-4"
        style={{ paddingTop: 16, paddingBottom: 140 }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="font-silkscreen text-muted leading-none" style={{ fontSize: 8 }}>···</span>
          </div>
        ) : sortedCodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <p className="font-silkscreen text-center leading-relaxed text-tertiary" style={{ fontSize: 8 }}>
              No codes yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 24 }}>
            {sortedCodes.map((invite, index) => (
              <div key={invite.id} className="flex flex-col" style={{ gap: 24 }}>
                <InviteCodeRow
                  invite={invite}
                  copiedId={copiedId}
                  onCopy={handleCopy}
                />
                {index < sortedCodes.length - 1 && (
                  <div className="w-full border-t border-border" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Fixed bottom: generate button + coin info ── */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-black border-t border-border px-4 flex flex-col"
        style={{
          paddingTop:    16,
          paddingBottom: 'max(env(safe-area-inset-bottom), 28px)',
          gap:           8,
        }}
      >
        <button
          onClick={handleForge}
          disabled={!canAfford || forging}
          className="w-full flex items-center justify-center transition-opacity active:opacity-80 disabled:opacity-40"
          style={{
            background:    'var(--color-purple)',
            paddingTop:    16,
            paddingBottom: 16,
            paddingLeft:   20,
            paddingRight:  20,
            boxShadow:     '4px 4px 0px 0px rgba(168,85,247,0.5)',
          }}
          aria-label="Generate invite code"
        >
          <span
            className="font-silkscreen text-primary leading-none"
            style={{ fontSize: 'var(--text-xs, 12px)' }}
          >
            {forging ? '···' : 'GENERATE INVITE CODE'}
          </span>
        </button>

        <p className="font-silkscreen leading-none" style={{ fontSize: 11 }}>
          <span style={{ color: 'var(--color-tertiary)' }}>25 COINS = INVITE CODE · </span>
          <span style={{ color: 'var(--color-coins)' }}>
            {infiniteCoins ? '∞' : coins.toLocaleString()} COINS
          </span>
        </p>
      </div>

      {/* ── Toast (above fixed bar) ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="fixed left-1/2 -translate-x-1/2 z-[70] px-5 py-2 font-silkscreen whitespace-nowrap"
            style={{
              bottom:     140,
              fontSize:   8,
              color:      toast.color,
              background: 'rgba(0,0,0,0.95)',
              border:     `1px solid ${toast.color}50`,
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </SlidePage>
  )
}

function InviteCodeRow({
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
        month: 'long',
        day:   'numeric',
        year:  'numeric',
      })
    } catch {
      return ''
    }
  })()

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      {/* Row 1: code + action button */}
      <div className="flex items-center justify-between">
        <span
          className="font-silkscreen text-white leading-none"
          style={{ fontSize: 24, letterSpacing: '0.2px' }}
        >
          {invite.code}
        </span>

        {isUsed ? (
          <div
            className="flex items-center flex-shrink-0 bg-black border border-muted"
            style={{ gap: 8, paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, boxShadow: '4px 4px 0px 0px rgba(113,113,122,0.5)' }}
          >
            <Copy style={{ width: 12, height: 12, color: 'var(--color-muted)', flexShrink: 0 }} aria-hidden="true" />
            <span className="font-silkscreen text-muted leading-none" style={{ fontSize: 11 }}>CLAIMED</span>
          </div>
        ) : (
          <button
            onClick={() => onCopy(invite.code, invite.id)}
            className="flex items-center flex-shrink-0 bg-black border border-purple active:opacity-70 transition-opacity"
            style={{ gap: 8, paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, boxShadow: '4px 4px 0px 0px rgba(168,85,247,0.5)' }}
            aria-label={`Copy code ${invite.code}`}
          >
            {isCopied ? (
              <Check style={{ width: 12, height: 12, color: 'var(--color-purple)', flexShrink: 0 }} aria-hidden="true" />
            ) : (
              <Copy style={{ width: 12, height: 12, color: 'var(--color-purple)', flexShrink: 0 }} aria-hidden="true" />
            )}
            <span className="font-silkscreen text-purple leading-none" style={{ fontSize: 11 }}>
              {isCopied ? 'COPIED!' : 'COPY CODE'}
            </span>
          </button>
        )}
      </div>

      {/* Row 2: date + status */}
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <span
          className="font-body flex-1 min-w-0 text-tertiary leading-none"
          style={{ fontSize: 11, fontVariationSettings: '"opsz" 14' }}
        >
          {formattedDate}
        </span>

        {isUsed ? (
          <span
            className="font-body text-right leading-none"
            style={{ fontSize: 11, color: '#22c55e', fontVariationSettings: '"opsz" 14' }}
          >
            Claimed by : {invite.used_by_username ?? 'unknown'}
          </span>
        ) : (
          <span
            className="font-body text-muted text-right leading-none whitespace-nowrap"
            style={{ fontSize: 11, fontVariationSettings: '"opsz" 14' }}
          >
            Unclaimed
          </span>
        )}
      </div>
    </div>
  )
}
