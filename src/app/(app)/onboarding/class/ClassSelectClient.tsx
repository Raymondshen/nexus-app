'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useActionState } from 'react'
import { PixelSprite, spriteInfoFor } from '@/components/game/PixelSprite'
import { Button } from '@/components/ui/Button'
import { selectClassAction } from './actions'
import { CLASS_BASE_STATS } from '@/lib/game/combat'
import type { AvatarClass, CombatClass } from '@/types'

// ─── Class metadata ───────────────────────────────────────────────────────────

const CLASSES: {
  id: CombatClass
  name: string
  role: string
  color: string
  attackDesc:  string
  abilityName: string
  abilityDesc: string
  abilityCost: number
  passiveName: string
  passiveDesc: string
}[] = [
  {
    id:          'warrior',
    name:        'WARRIOR',
    role:        'TANK / DPS',
    color:       '#ef4444',
    attackDesc:  'ATK-scaled strike. Hits harder at low HP.',
    abilityName: 'GUARD',
    abilityDesc: 'Force the boss to attack you for 60s. Your DEF rises 40%.',
    abilityCost: 2,
    passiveName: 'LAST STAND',
    passiveDesc: 'Below 30% HP, all damage dealt increases by 20%.',
  },
  {
    id:          'healer',
    name:        'HEALER',
    role:        'SUPPORT / SUSTAIN',
    color:       '#22c55e',
    attackDesc:  'Weak hit. Restores 5% of damage dealt back to yourself.',
    abilityName: 'MEND',
    abilityDesc: 'INT-scaled heal to all living crew members. Cannot revive the downed.',
    abilityCost: 2,
    passiveName: 'SECOND WIND',
    passiveDesc: '+15% to all healing produced — both MEND and Normal Attack self-heal.',
  },
  {
    id:          'archer',
    name:        'ARCHER',
    role:        'DPS / ACCURACY',
    color:       '#ffd700',
    attackDesc:  'ATK-scaled hit. High DEX raises crit chance significantly.',
    abilityName: 'VOLLEY',
    abilityDesc: 'Hit + apply a 20% damage-taken debuff on the boss for 30s.',
    abilityCost: 2,
    passiveName: 'PRECISION',
    passiveDesc: 'Highest natural crit chance in the squad. Aim true.',
  },
  {
    id:          'rogue',
    name:        'ROGUE',
    role:        'BURST / SPEED',
    color:       '#bf5fff',
    attackDesc:  'Fast ATK-scaled hit. Consecutive messages stack a damage bonus.',
    abilityName: 'BACKSTAB',
    abilityDesc: 'Guaranteed crit. 2.5× damage if boss is above 50% HP.',
    abilityCost: 2,
    passiveName: 'MOMENTUM',
    passiveDesc: 'Each message stacks +5% dmg (cap 25%). Resets after 1hr silence.',
  },
  {
    id:          'mage',
    name:        'MAGE',
    role:        'HIGH DAMAGE / FRAGILE',
    color:       '#00e5ff',
    attackDesc:  'Highest ATK of any class. Hits hardest on every normal attack.',
    abilityName: 'CAST',
    abilityDesc: '3× ATK arcane nuke. Crit-eligible.',
    abilityCost: 2,
    passiveName: 'ARCANE WARD',
    passiveDesc: 'Below 40% HP, your DEF is multiplied by 1.3 dynamically.',
  },
]

// ─── Stat bar ─────────────────────────────────────────────────────────────────

const STAT_KEYS: Array<keyof typeof CLASS_BASE_STATS['warrior']> = ['hp', 'atk', 'def', 'dex', 'int']
const STAT_MAX: Record<string, number> = { hp: 42, atk: 22, dex: 22, def: 24, int: 26 }

function StatRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="font-pixel w-[18px] text-right flex-shrink-0" style={{ fontSize: 6, color: 'var(--color-tertiary)' }}>
        {label.toUpperCase()}
      </span>
      <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: '#1a0d2e' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: `${color}bb` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 }}
        />
      </div>
      <span className="font-silkscreen flex-shrink-0" style={{ fontSize: 7, color: 'var(--color-primary)', width: 16, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}

// ─── Class slide ─────────────────────────────────────────────────────────────

function ClassSlide({ cls, visible }: { cls: typeof CLASSES[number]; visible: boolean }) {
  const spriteInfo = spriteInfoFor(cls.id as AvatarClass)
  const stats      = CLASS_BASE_STATS[cls.id]

  return (
    <div className="flex flex-col items-center w-full" style={{ gap: 20 }}>
      {/* Sprite */}
      <div
        className="flex items-center justify-center relative"
        style={{
          width:        140,
          height:       140,
          background:   `radial-gradient(circle, ${cls.color}18 0%, transparent 70%)`,
          border:       `1px solid ${cls.color}33`,
        }}
      >
        {spriteInfo ? (
          <PixelSprite spriteId={spriteInfo.id} nativePx={spriteInfo.nativePx} scale={4} animate={visible} />
        ) : (
          <div style={{ width: 96, height: 96, background: `${cls.color}22`, border: `1px solid ${cls.color}44` }} />
        )}
        {/* Glow ring */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: `inset 0 0 30px ${cls.color}22`, border: `1px solid ${cls.color}33` }}
        />
      </div>

      {/* Class name + role */}
      <div className="text-center">
        <h2 className="font-pixel" style={{ fontSize: 14, color: cls.color, textShadow: `0 0 16px ${cls.color}88` }}>
          {cls.name}
        </h2>
        <p className="font-silkscreen mt-1" style={{ fontSize: 8, color: 'var(--color-tertiary)' }}>
          {cls.role}
        </p>
      </div>

      {/* Stat block */}
      <div className="w-full flex flex-col gap-2 px-2">
        {STAT_KEYS.map((k) => (
          <StatRow
            key={k}
            label={k}
            value={stats[k]}
            max={STAT_MAX[k] ?? 30}
            color={cls.color}
          />
        ))}
      </div>

      {/* Kit */}
      <div className="w-full flex flex-col gap-2">
        {/* Normal Attack */}
        <div
          className="px-3 py-2"
          style={{ background: `${cls.color}0a`, border: `1px solid ${cls.color}22` }}
        >
          <p className="font-pixel mb-1" style={{ fontSize: 6, color: cls.color }}>NORMAL ATTACK</p>
          <p className="font-silkscreen leading-relaxed" style={{ fontSize: 8, color: 'var(--color-secondary)' }}>
            {cls.attackDesc}
          </p>
        </div>

        {/* Ability */}
        <div
          className="px-3 py-2"
          style={{ background: `${cls.color}0a`, border: `1px solid ${cls.color}33` }}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="font-pixel" style={{ fontSize: 6, color: cls.color }}>
              ABILITY — {cls.abilityName}
            </p>
            <span className="font-silkscreen" style={{ fontSize: 7, color: 'var(--color-tertiary)' }}>
              Cost: {cls.abilityCost}
            </span>
          </div>
          <p className="font-silkscreen leading-relaxed" style={{ fontSize: 8, color: 'var(--color-secondary)' }}>
            {cls.abilityDesc}
          </p>
        </div>

        {/* Passive */}
        <div
          className="px-3 py-2"
          style={{ background: '#0f0820', border: '1px solid #2a1545' }}
        >
          <p className="font-pixel mb-1" style={{ fontSize: 6, color: '#6b4f8f' }}>
            PASSIVE — {cls.passiveName}
          </p>
          <p className="font-silkscreen leading-relaxed" style={{ fontSize: 8, color: 'var(--color-tertiary)' }}>
            {cls.passiveDesc}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ClassSelectClient({
  crewId,
  welcome,
  invite,
}: {
  crewId:  string
  welcome: boolean
  invite:  string | null
}) {
  const [idx,     setIdx]     = useState(0)
  const [dir,     setDir]     = useState(0)  // 1 = forward, -1 = back
  const [state,   action, isPending] = useActionState(selectClassAction, null)

  const go = useCallback((delta: number) => {
    setDir(delta)
    setIdx((i) => (i + delta + CLASSES.length) % CLASSES.length)
  }, [])

  const selected = CLASSES[idx]

  return (
    <div
      className="min-h-screen flex flex-col bg-[#0a0612] relative overflow-hidden"
      style={{ maxWidth: 390, margin: '0 auto' }}
    >
      {/* Scan-line overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
        }}
      />

      {/* Header */}
      <div className="relative z-10 text-center pt-12 pb-4 px-4 flex-shrink-0">
        <h1
          className="font-pixel"
          style={{ fontSize: 18, color: '#bf5fff', textShadow: '0 0 30px rgba(191,95,255,0.9), 0 0 60px rgba(191,95,255,0.3)' }}
        >
          NEXUS
        </h1>
        <p className="font-pixel mt-2" style={{ fontSize: 8, color: 'var(--color-tertiary)' }}>
          CHOOSE YOUR CLASS
        </p>
      </div>

      {/* Carousel */}
      <div className="relative z-10 flex-1 px-4 overflow-hidden">
        {/* Slide counter */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {CLASSES.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i - idx)}
              className="rounded-full transition-all duration-200"
              style={{
                width:      i === idx ? 16 : 6,
                height:     6,
                background: i === idx ? selected.color : '#2a1545',
              }}
              aria-label={`Go to ${CLASSES[i].name}`}
            />
          ))}
        </div>

        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={idx}
            custom={dir}
            variants={{
              enter:  (d: number) => ({ x: d > 0 ? 320 : -320, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit:   (d: number) => ({ x: d > 0 ? -320 : 320, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60 || info.velocity.x < -300) go(1)
              else if (info.offset.x > 60 || info.velocity.x > 300) go(-1)
            }}
            className="w-full"
          >
            <ClassSlide cls={selected} visible={true} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation + confirm */}
      <div className="relative z-10 flex-shrink-0 px-4 pb-8 pt-4" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
        {state?.error && (
          <div className="mb-3 px-3 py-2" style={{ background: '#ff444410', border: '1px solid #ff444440' }}>
            <p className="font-pixel" style={{ fontSize: 7, color: '#ff4444' }}>{state.error}</p>
          </div>
        )}

        {/* Arrow navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => go(-1)}
            className="flex items-center gap-1 px-3 py-2 transition-opacity active:opacity-60"
            style={{ background: '#1a0d2e', border: '1px solid #2a1545' }}
          >
            <span className="font-pixel" style={{ fontSize: 7, color: 'var(--color-tertiary)' }}>← PREV</span>
          </button>
          <span className="font-pixel" style={{ fontSize: 7, color: 'var(--color-muted)' }}>
            {idx + 1} / {CLASSES.length}
          </span>
          <button
            onClick={() => go(1)}
            className="flex items-center gap-1 px-3 py-2 transition-opacity active:opacity-60"
            style={{ background: '#1a0d2e', border: '1px solid #2a1545' }}
          >
            <span className="font-pixel" style={{ fontSize: 7, color: 'var(--color-tertiary)' }}>NEXT →</span>
          </button>
        </div>

        <form action={action}>
          <input type="hidden" name="class"   value={selected.id} />
          <input type="hidden" name="crewId"  value={crewId} />
          <input type="hidden" name="welcome" value={welcome ? '1' : '0'} />
          {invite && <input type="hidden" name="invite" value={invite} />}
          <Button
            type="submit"
            variant="filled"
            loading={isPending}
            className="w-full"
            style={{
              background:  selected.color,
              border:      'none',
              boxShadow:   `0 0 20px ${selected.color}44`,
            }}
          >
            ENTER AS {selected.name}
          </Button>
        </form>
      </div>
    </div>
  )
}
