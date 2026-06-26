'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/shared/supabase/client'
import type { Poll } from '@/types'

interface PollCardProps {
  pollId:        string
  currentUserId: string
}

function timeLabel(poll: Poll): string {
  if (poll.closed_at) return 'Closed by creator'
  const now = Date.now()
  const exp = new Date(poll.expires_at).getTime()
  if (exp <= now) return 'Expired'
  const msLeft   = exp - now
  const minsLeft = Math.ceil(msLeft / 60_000)
  if (minsLeft <= 1)  return 'Less than 1 min left'
  if (minsLeft < 60)  return `${minsLeft}m left`
  const hrsLeft = Math.floor(minsLeft / 60)
  return `${hrsLeft}h ${minsLeft % 60}m left`
}

export function PollCard({ pollId, currentUserId }: PollCardProps) {
  const [poll,    setPoll]    = useState<Poll | null>(null)
  const [loading, setLoading] = useState(true)
  const [voting,  setVoting]  = useState(false)
  const [closing, setClosing] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  // Force re-render for live countdown
  const [, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('polls')
      .select('*')
      .eq('id', pollId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        if (data) setPoll(data as unknown as Poll)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [pollId])

  // Realtime: patch votes and closed_at as other members vote or creator closes
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`poll:${pollId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'polls', filter: `id=eq.${pollId}` },
        (payload) => {
          const updated = payload.new as Poll
          setPoll((prev) => prev
            ? { ...prev, votes: updated.votes as Record<string, string[]>, closed_at: updated.closed_at }
            : prev
          )
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [pollId])

  // Tick every 30s to update the countdown label while the poll is open
  useEffect(() => {
    if (!poll || poll.closed_at) return
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [poll])

  const handleVote = useCallback(async (optionIndex: number) => {
    if (!poll || voting) return
    const isClosed = !!(poll.closed_at) || new Date(poll.expires_at) <= new Date()
    if (isClosed) return

    setVoting(true)
    setError(null)

    // Optimistic update
    const prevVotes  = poll.votes
    const newVotes   = { ...prevVotes }
    const optKey     = String(optionIndex)
    const wasOnThis  = (prevVotes[optKey] ?? []).includes(currentUserId)

    // Remove user from all options
    for (let i = 0; i < poll.options.length; i++) {
      const k = String(i)
      if (newVotes[k]) {
        newVotes[k] = newVotes[k].filter((id) => id !== currentUserId)
        if (newVotes[k].length === 0) delete newVotes[k]
      }
    }
    // Add to new option unless toggling off
    if (!wasOnThis) {
      newVotes[optKey] = [...(newVotes[optKey] ?? []), currentUserId]
    }

    setPoll((prev) => (prev ? { ...prev, votes: newVotes } : prev))

    try {
      const { data, error: rpcError } = await createClient().rpc('vote_on_poll', {
        p_poll_id:      pollId,
        p_option_index: optionIndex,
      })
      if (rpcError) throw rpcError
      if (data) setPoll((prev) => (prev ? { ...prev, votes: data as Record<string, string[]> } : prev))
    } catch (err) {
      setPoll((prev) => (prev ? { ...prev, votes: prevVotes } : prev))
      setError(err instanceof Error ? err.message : 'Vote failed')
    } finally {
      setVoting(false)
    }
  }, [poll, voting, pollId, currentUserId])

  const handleClose = useCallback(async () => {
    if (!poll || closing) return
    setClosing(true)
    setError(null)

    const prev = poll.closed_at
    setPoll((p) => (p ? { ...p, closed_at: new Date().toISOString() } : p))

    try {
      const { error: rpcError } = await createClient().rpc('close_poll', { p_poll_id: pollId })
      if (rpcError) throw rpcError
    } catch (err) {
      setPoll((p) => (p ? { ...p, closed_at: prev } : p))
      setError(err instanceof Error ? err.message : 'Close failed')
    } finally {
      setClosing(false)
    }
  }, [poll, closing, pollId])

  if (loading) {
    return (
      <div className="mt-1 border border-border bg-[#0a0612] p-3 animate-pulse">
        <div className="h-2 w-16 bg-border mb-2 rounded" />
        <div className="h-3 w-3/4 bg-border mb-4 rounded" />
        <div className="h-9 w-full bg-border mb-2 rounded" />
        <div className="h-9 w-full bg-border rounded" />
      </div>
    )
  }

  if (!poll) return null

  const now        = new Date()
  const isExpired  = new Date(poll.expires_at) <= now
  const isClosed   = !!(poll.closed_at) || isExpired
  const totalVotes = Object.values(poll.votes).reduce((s, ids) => s + ids.length, 0)
  const userVote   = Object.entries(poll.votes).find(([, ids]) => ids.includes(currentUserId))?.[0]
  const hasVoted   = userVote !== undefined
  const isCreator  = poll.creator_id === currentUserId

  return (
    <div
      className="mt-1 border bg-[#0a0612] overflow-hidden"
      style={{ borderColor: isClosed ? 'rgba(255,255,255,0.08)' : 'rgba(168,85,247,0.35)' }}
    >
      {/* Poll header */}
      <div className="px-3 pt-3 pb-2">
        <p className="font-silkscreen text-[8px] leading-none mb-1" style={{ color: isClosed ? 'var(--color-tertiary)' : 'var(--color-purple)' }}>
          POLL{isClosed ? ' · CLOSED' : ''}
        </p>
        <p
          className="font-body font-medium text-[14px] text-primary leading-normal"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          {poll.question}
        </p>
      </div>

      {/* Options */}
      <div className="px-3 pb-2 flex flex-col gap-2">
        {poll.options.map((option, idx) => {
          const optKey    = String(idx)
          const voteCount = (poll.votes[optKey] ?? []).length
          const pct       = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0
          const isSelected = userVote === optKey

          return (
            <button
              key={idx}
              onClick={!isClosed && !voting ? () => handleVote(idx) : undefined}
              disabled={isClosed || voting}
              className={`relative w-full text-left overflow-hidden border transition-colors ${
                isSelected
                  ? 'border-purple'
                  : 'border-border'
              } ${!isClosed && !voting ? 'active:opacity-80' : ''}`}
              style={{ minHeight: 38 }}
            >
              {/* Progress bar fill (shown after voting or when closed) */}
              {(hasVoted || isClosed) && (
                <motion.div
                  className="absolute inset-y-0 left-0"
                  style={{ backgroundColor: isSelected ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.04)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                />
              )}

              <div className="relative flex items-center justify-between px-3 py-2 gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="flex-shrink-0 w-3 h-3 border-2 rounded-full transition-colors"
                    style={{ borderColor: isSelected ? 'var(--color-purple)' : 'var(--color-tertiary)', backgroundColor: isSelected ? 'var(--color-purple)' : 'transparent' }}
                  />
                  <span
                    className={`font-body text-[13px] leading-normal truncate ${isSelected ? 'text-primary' : 'text-secondary'}`}
                    style={{ fontVariationSettings: '"opsz" 14' }}
                  >
                    {option}
                  </span>
                </div>
                {(hasVoted || isClosed) && (
                  <span className="font-silkscreen text-[8px] text-tertiary leading-none flex-shrink-0 whitespace-nowrap">
                    {Math.round(pct)}%
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-3 pb-3 flex items-center justify-between gap-2">
        <p className="font-silkscreen text-[8px] text-tertiary leading-none">
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} · {timeLabel(poll)}
        </p>

        <div className="flex items-center gap-3">
          {error && (
            <p className="font-silkscreen text-[8px] text-[#ef4444] leading-none">{error}</p>
          )}
          {!isClosed && isCreator && (
            <button
              onClick={handleClose}
              disabled={closing}
              className="font-silkscreen text-[8px] text-[#ef4444] leading-none active:opacity-70 transition-opacity disabled:opacity-40"
            >
              {closing ? 'CLOSING...' : 'CLOSE POLL'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
