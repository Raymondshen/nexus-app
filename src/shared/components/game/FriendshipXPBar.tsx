'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/shared/supabase/client'
import type { FriendshipXP } from '@/types'

const BOND_XP_PER_LEVEL = 100

function pairKey(a: string, b: string) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

interface FriendshipXPBarProps {
  userAId:         string
  userBId:         string
  initialTotalXP?: number
  skipRealtime?:   boolean
}

export function FriendshipXPBar({ userAId, userBId, initialTotalXP, skipRealtime }: FriendshipXPBarProps) {
  const canonA = userAId < userBId ? userAId : userBId
  const canonB = userAId < userBId ? userBId : userAId

  const [totalXP, setTotalXP] = useState(initialTotalXP ?? 0)

  useEffect(() => {
    if (skipRealtime) return

    const supabase = createClient()
    let cancelled  = false

    if (initialTotalXP === undefined) {
      supabase
        .from('friendship_xp')
        .select('total_xp')
        .eq('user_a', canonA)
        .eq('user_b', canonB)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return
          const row = data as FriendshipXP | null
          if (row) setTotalXP(row.total_xp)
        })
    }

    const ch = supabase
      .channel(`friendship-xp:${pairKey(canonA, canonB)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendship_xp', filter: `user_a=eq.${canonA}` },
        (payload) => {
          const row = payload.new as FriendshipXP | null
          if (!row || row.user_b !== canonB) return
          setTotalXP(row.total_xp)
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(ch)
    }
  }, [canonA, canonB, skipRealtime]) // eslint-disable-line react-hooks/exhaustive-deps

  const level    = Math.floor(totalXP / BOND_XP_PER_LEVEL) + 1
  const progress = ((totalXP % BOND_XP_PER_LEVEL) / BOND_XP_PER_LEVEL) * 100

  return (
    <div className="flex flex-col w-full" style={{ gap: 'var(--space-3)' }}>
      <div className="flex items-center w-full font-silkscreen" style={{ gap: 'var(--space-2)' }}>
        <p className="flex-1 min-w-0 leading-[0] text-[0px]">
          <span className="text-[length:var(--text-mini)] leading-none text-secondary">
            Bond Lv.{level}
          </span>
          <span className="text-[length:var(--text-mini)] leading-none text-tertiary">
            {` · ${totalXP % BOND_XP_PER_LEVEL} / ${BOND_XP_PER_LEVEL} XP`}
          </span>
        </p>
      </div>

      <div className="bg-surface h-1 overflow-hidden w-full relative">
        <motion.div
          className="absolute left-0 top-0 h-full bg-purple"
          animate={{ width: `${progress}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        />
      </div>
    </div>
  )
}
