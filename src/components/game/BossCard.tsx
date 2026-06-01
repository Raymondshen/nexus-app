'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { getBossPhase, formatTimeRemaining, isRaidExpired } from '@/lib/game/boss'
import { BossPhaseAlert } from './BossPhaseAlert'
import { useChatStore } from '@/store/chatStore'
import type { ActiveRaid, ElementType } from '@/types'

// ─── Void pixel art — 16×16 ───────────────────────────────────────────────────
const VOID_GRID = [
  '0000011111100000',
  '0001122222211000',
  '0012222222221100',
  '0122222222222100',
  '1222223322222210',
  '1222233332222210',
  '1222222222222210',
  '1222222222222210',
  '1222222222222210',
  '1222221122222210',
  '0122222222222100',
  '0012222222221100',
  '0001122222211000',
  '0000011111100000',
  '0000000000000000',
  '0000000000000000',
]

const PIXEL_COLORS: Record<string, string> = {
  '0': 'transparent',
  '1': '#4a0a5a',
  '2': '#1a0022',
  '3': '#ff2200',
  '4': '#05000a',
}

function VoidSprite() {
  return (
    <div className="relative" style={{ width: 64, height: 64 }}>
      <div
        className="absolute inset-0 rounded-full blur-xl"
        style={{ background: 'radial-gradient(circle, rgba(255,0,0,0.3) 0%, transparent 70%)' }}
      />
      <motion.div
        animate={{ scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ imageRendering: 'pixelated', display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', width: 64, height: 64 }}
      >
        {VOID_GRID.flatMap((row, r) =>
          row.split('').map((cell, c) => (
            <div
              key={`${r}-${c}`}
              style={{
                backgroundColor: PIXEL_COLORS[cell] ?? 'transparent',
                boxShadow: cell === '3' ? '0 0 3px #ff4400' : undefined,
              }}
            />
          ))
        )}
      </motion.div>
    </div>
  )
}

// ─── Damage log entry ─────────────────────────────────────────────────────────

export interface DamageLogEntry {
  id: string
  username: string
  damage: number
  elementType: ElementType | null
  ts: number
}

const ELEMENT_COLORS: Record<ElementType, string> = {
  fire: '#ff4444', water: '#00e5ff', lightning: '#ffd700',
  nature: '#66bb6a', shadow: '#bf5fff', arcane: '#00e5ff',
}

// ─── BossCard ─────────────────────────────────────────────────────────────────

interface BossCardProps {
  raidId:      string
  crewId:      string
  initialRaid: ActiveRaid | null
}

export function BossCard({ raidId, crewId, initialRaid }: BossCardProps) {
  const [raid,       setRaid]       = useState<ActiveRaid | null>(initialRaid)
  const [shaking,    setShaking]    = useState(false)
  const [phaseAlert, setPhaseAlert] = useState<2 | 3 | null>(null)
  const [damageLog,  setDamageLog]  = useState<DamageLogEntry[]>([])
  const [timeLeft,   setTimeLeft]   = useState(() =>
    initialRaid ? formatTimeRemaining(initialRaid.expires_at) : '--:--:--'
  )
  const [freqBar, setFreqBar] = useState(0)

  const { setActiveRaid } = useChatStore()

  // Use ref to read latest raid HP without recreating the Realtime subscription
  const raidRef = useRef(raid)
  raidRef.current = raid

  const prevPhaseRef    = useRef(raid ? getBossPhase(raid.current_hp, raid.max_hp) : 1)
  const lastMessageRef  = useRef(Date.now())
  const fetchedRef      = useRef(false)

  // Fetch raid data if not supplied (boss spawned mid-session)
  useEffect(() => {
    if (raid || fetchedRef.current) return
    fetchedRef.current = true
    const supabase = createClient()
    supabase
      .from('active_raids')
      .select('*')
      .eq('id', raidId)
      .single()
      .then(({ data }) => {
        if (data) {
          const fetched = data as ActiveRaid
          setRaid(fetched)
          setActiveRaid(fetched)
          setTimeLeft(formatTimeRemaining(fetched.expires_at))
          prevPhaseRef.current  = getBossPhase(fetched.current_hp, fetched.max_hp)
        }
      })
  }, [raidId]) // eslint-disable-line react-hooks/exhaustive-deps

  const hpPct   = raid ? Math.max(0, (raid.current_hp / raid.max_hp) * 100) : 0
  const phase   = raid ? getBossPhase(raid.current_hp, raid.max_hp) : 1
  const expired = raid ? isRaidExpired(raid.expires_at) : false
  const won     = !!raid?.defeated_at

  // Countdown timer
  useEffect(() => {
    if (!raid || won || expired) return
    const t = setInterval(() => setTimeLeft(formatTimeRemaining(raid.expires_at)), 1000)
    return () => clearInterval(t)
  }, [raid?.expires_at, won, expired]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 3 frequency meter
  useEffect(() => {
    if (phase !== 3 || won) return
    const t = setInterval(() => setFreqBar((v) => Math.max(0, v - 1.8)), 600)
    return () => clearInterval(t)
  }, [phase, won])

  // Realtime — active_raids HP updates (stable dep: only raidId)
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel(`raid:${raidId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'active_raids', filter: `id=eq.${raidId}` },
        (payload) => {
          const updated  = payload.new as ActiveRaid
          const oldHP    = raidRef.current?.current_hp ?? updated.current_hp
          const newHP    = updated.current_hp
          const newPhase = getBossPhase(newHP, updated.max_hp)

          setRaid(updated)
          setActiveRaid(updated)

          if (newHP < oldHP) {
            setShaking(true)
            setTimeout(() => setShaking(false), 500)
          }

          if (newPhase > prevPhaseRef.current) {
            setPhaseAlert(newPhase as 2 | 3)
            prevPhaseRef.current = newPhase
          }

          setFreqBar(100)
          lastMessageRef.current = Date.now()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [raidId]) // eslint-disable-line react-hooks/exhaustive-deps

  const addDamageEntry = useCallback((entry: DamageLogEntry) => {
    setDamageLog((prev) => [entry, ...prev].slice(0, 5))
    setFreqBar(100)
  }, [])

  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (cardRef.current) {
      // @ts-expect-error custom property for inter-component comm
      cardRef.current.__addDamageEntry = addDamageEntry
    }
  }, [addDamageEntry])

  // Loading state while raid data is being fetched
  if (!raid) {
    return (
      <div
        className="w-full my-2 p-4 text-center"
        style={{ border: '1px solid rgba(255,34,0,0.4)', background: 'rgba(10,0,0,0.8)' }}
      >
        <p className="font-pixel text-[8px] text-[#ff4444]/60">BOSS INCOMING...</p>
      </div>
    )
  }

  if (won) return <VictoryCard damageLog={damageLog} />
  if (expired) return <ExpiredCard />

  return (
    <>
      <BossPhaseAlert phase={phaseAlert} onDismiss={() => setPhaseAlert(null)} />

      <motion.div
        ref={cardRef}
        data-boss-card={raidId}
        animate={shaking ? { x: [-4, 4, -3, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full my-2 overflow-hidden relative"
        style={{
          background: 'linear-gradient(180deg, #1a0000 0%, #0a0612 100%)',
          border: '1px solid rgba(255,34,0,0.4)',
          boxShadow: '0 0 20px rgba(255,0,0,0.15), 0 0 40px rgba(255,0,0,0.06), inset 0 1px 0 rgba(255,34,0,0.1)',
        }}
      >
        {/* Scanline overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)',
          }}
        />

        {/* Pulsing red border glow */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          style={{ boxShadow: 'inset 0 0 12px rgba(255,34,0,0.3)' }}
        />

        <div className="relative z-20 p-4">
          {/* Header row */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <VoidSprite />
              <div>
                <motion.p
                  animate={{ opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="font-pixel text-[14px] text-[#ff2200] mb-1 leading-tight"
                  style={{ textShadow: '0 0 12px rgba(255,34,0,0.8)' }}
                >
                  THE VOID
                </motion.p>
                <p className="font-pixel text-[7px] text-[#6b2020] leading-relaxed">
                  Silence feeds it.<br />Chaos defeats it.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <span
                className="font-pixel text-[8px] px-2 py-0.5 border"
                style={{
                  color:       phase === 3 ? '#ff2200' : phase === 2 ? '#ff8800' : '#bf5fff',
                  borderColor: phase === 3 ? 'rgba(255,34,0,0.5)' : phase === 2 ? 'rgba(255,136,0,0.5)' : 'rgba(191,95,255,0.5)',
                  background:  phase === 3 ? 'rgba(255,0,0,0.1)' : 'transparent',
                }}
              >
                PHASE {phase}
              </span>
              <span className="font-pixel text-[7px] text-[#3d1010]">{timeLeft}</span>
            </div>
          </div>

          {/* HP bar */}
          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="font-pixel text-[7px] text-[#6b2020]">HP</span>
              <span className="font-pixel text-[7px] text-[#9b4040]">
                {raid.current_hp} / {raid.max_hp}
              </span>
            </div>
            <div className="h-3 bg-[#0a0000] border border-[#2a0000]">
              <motion.div
                className="h-full"
                animate={{ width: `${hpPct}%` }}
                transition={{ type: 'spring', stiffness: 80, damping: 20 }}
                style={{
                  background:  hpPct > 60 ? 'linear-gradient(90deg, #880000, #ff2200)' :
                               hpPct > 30 ? 'linear-gradient(90deg, #aa2200, #ff6600)' :
                                            'linear-gradient(90deg, #cc0000, #ff0000)',
                  boxShadow:   `0 0 8px ${hpPct > 30 ? 'rgba(255,34,0,0.6)' : 'rgba(255,0,0,0.9)'}`,
                }}
              />
            </div>
          </div>

          {/* Phase weakness hint — discovery arc */}
          <div
            className="mb-3 px-2 py-1.5 border"
            style={{
              borderColor: phase === 3 ? 'rgba(255,34,0,0.4)' : 'rgba(191,95,255,0.15)',
              background:  phase === 3 ? 'rgba(255,0,0,0.06)' : 'rgba(191,95,255,0.03)',
            }}
          >
            <p
              className="font-pixel text-[7px] leading-relaxed"
              style={{ color: phase === 3 ? '#ff4444' : '#6b4f8f' }}
            >
              {phase === 1 && 'The Void recoils from something...'}
              {phase === 2 && 'Rapid messages seem to hurt it.'}
              {phase === 3 && '⚡ WEAKNESS: FIRE — Send rapid messages!'}
            </p>
          </div>

          {/* Phase 3 — frequency meter */}
          {phase === 3 && (
            <div className="mb-3">
              <div className="flex justify-between mb-1">
                <span className="font-pixel text-[7px] text-[#ff2200]">⚡ FEED THE VOID</span>
                <span className="font-pixel text-[7px] text-[#ff4400]">
                  {freqBar < 20 ? 'IT HEALS' : 'KEEP GOING'}
                </span>
              </div>
              <div className="h-2 bg-[#0a0000] border border-[#2a0000]">
                <motion.div
                  className="h-full"
                  animate={{ width: `${freqBar}%` }}
                  transition={{ duration: 0.3 }}
                  style={{
                    background: freqBar > 40
                      ? 'linear-gradient(90deg, #ff4400, #ff8800)'
                      : 'linear-gradient(90deg, #880000, #ff2200)',
                    boxShadow: '0 0 6px rgba(255,100,0,0.6)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Damage log */}
          {damageLog.length > 0 && (
            <div className="border-t border-[#2a0000] pt-2 mt-2">
              <p className="font-pixel text-[7px] text-[#3d1010] mb-1">DAMAGE LOG</p>
              <div className="flex flex-col gap-0.5">
                {damageLog.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between">
                    <span className="font-pixel text-[7px] text-[#6b2020] truncate max-w-[60%]">
                      {entry.username}
                    </span>
                    <span
                      className="font-pixel text-[7px]"
                      style={{ color: entry.elementType ? ELEMENT_COLORS[entry.elementType] : '#ff4444' }}
                    >
                      -{entry.damage} DMG
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}

function VictoryCard({ damageLog }: { damageLog: DamageLogEntry[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full my-2 p-4 text-center"
      style={{
        background: 'linear-gradient(180deg, #0a1a00 0%, #0a0612 100%)',
        border: '1px solid rgba(102,187,106,0.4)',
        boxShadow: '0 0 30px rgba(102,187,106,0.1)',
      }}
    >
      <p
        className="font-pixel text-[14px] text-[#66bb6a] mb-1"
        style={{ textShadow: '0 0 12px rgba(102,187,106,0.8)' }}
      >
        THE VOID FALLS
      </p>
      <p className="font-pixel text-[8px] text-[#4a8a4a]">Your crew defeated the darkness.</p>
      {damageLog[0] && (
        <p className="font-pixel text-[7px] text-[#3d6a3d] mt-2">
          MVP: {damageLog[0].username}
        </p>
      )}
    </motion.div>
  )
}

function ExpiredCard() {
  return (
    <div
      className="w-full my-2 p-4 text-center"
      style={{
        background: 'linear-gradient(180deg, #0d0d0d 0%, #0a0612 100%)',
        border: '1px solid rgba(100,100,100,0.2)',
      }}
    >
      <p className="font-pixel text-[11px] text-[#3d3d3d] mb-1">THE VOID ENDURED</p>
      <p className="font-pixel text-[7px] text-[#2a2a2a]">The raid window closed. Silence won.</p>
    </div>
  )
}
