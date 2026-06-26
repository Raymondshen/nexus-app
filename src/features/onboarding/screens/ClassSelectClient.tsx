'use client'

import { useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { selectClassAction } from '@/app/(app)/onboarding/class/actions'
import { spriteIdFor } from '@/shared/components/game/PixelSprite'
import { CLASS_BASE_STATS } from '@/features/combat/utils/combat'
import type { AvatarClass, CombatClass } from '@/types'

// ─── Class metadata ───────────────────────────────────────────────────────────

const CLASSES: {
  id:           CombatClass
  name:         string
  role:         string
  attackDesc:   string
  abilityName:  string
  abilityDesc:  string
  passiveName:  string
  passiveDesc:  string
}[] = [
  {
    id:          'warrior',
    name:        'WARRIOR',
    role:        'tank/dps',
    attackDesc:  'atk-scaled strike. hits harder at low hp.',
    abilityName: 'guard',
    abilityDesc: 'force the boss to attack you for 60s. your def rises 40%.',
    passiveName: 'last stand',
    passiveDesc: 'below 30% hp, all damage dealt increases by 20%.',
  },
  {
    id:          'healer',
    name:        'HEALER',
    role:        'support/sustain',
    attackDesc:  'weak hit. restores 5% of damage dealt back to yourself.',
    abilityName: 'mend',
    abilityDesc: 'int-scaled heal to all living crew members. cannot revive the downed.',
    passiveName: 'second wind',
    passiveDesc: '+15% to all healing — both mend and normal attack self-heal.',
  },
  {
    id:          'archer',
    name:        'ARCHER',
    role:        'dps/accuracy',
    attackDesc:  'atk-scaled hit. high dex raises crit chance significantly.',
    abilityName: 'volley',
    abilityDesc: 'hit + apply a 20% damage-taken debuff on the boss for 30s.',
    passiveName: 'precision',
    passiveDesc: 'highest natural crit chance in the squad. aim true.',
  },
  {
    id:          'rogue',
    name:        'ROGUE',
    role:        'burst/speed',
    attackDesc:  'fast atk-scaled hit. consecutive messages stack a damage bonus.',
    abilityName: 'backstab',
    abilityDesc: 'guaranteed crit. 2.5× damage if boss is above 50% hp.',
    passiveName: 'momentum',
    passiveDesc: 'each message stacks +5% dmg (cap 25%). resets after 1hr silence.',
  },
  {
    id:          'mage',
    name:        'MAGE',
    role:        'high damage/fragile',
    attackDesc:  'highest atk of any class. hits hardest on every normal attack.',
    abilityName: 'cast',
    abilityDesc: '3× atk arcane nuke. crit-eligible.',
    passiveName: 'arcane ward',
    passiveDesc: 'below 40% hp, your def is multiplied by 1.3 dynamically.',
  },
]

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
  const router = useRouter()
  const [idx, setIdx] = useState(0)
  const [state, action, isPending] = useActionState(selectClassAction, null)

  const selected  = CLASSES[idx]
  const spriteId  = spriteIdFor(selected.id as AvatarClass)
  const stats     = CLASS_BASE_STATS[selected.id]

  return (
    <div className="min-h-screen bg-black flex flex-col justify-end">
      <div
        className="bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col overflow-y-auto nexus-scroll"
        style={{
          gap:           16,
          paddingTop:    16,
          paddingLeft:   16,
          paddingRight:  16,
          paddingBottom: 'max(env(safe-area-inset-bottom), 28px)',
          maxHeight:     '92vh',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 8 }}>
          <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
            Squad Sh**t...
          </p>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <p className="font-body font-bold text-primary leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
              Choose Your Class
            </p>
            <p className="font-body font-light text-tertiary leading-none" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
              You cannot change your class afterwards.
            </p>
          </div>
        </div>

        {/* ── Class selector row ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-shrink-0">
          {CLASSES.map((cls, i) => {
            const id         = spriteIdFor(cls.id as AvatarClass)
            const isSelected = i === idx
            return (
              <button
                key={cls.id}
                type="button"
                onClick={() => setIdx(i)}
                className="flex items-center justify-center overflow-hidden"
                style={{
                  width:      48,
                  height:     48,
                  background: 'var(--color-surface-sheet)',
                  border:     `1px solid ${isSelected ? 'var(--color-purple)' : 'var(--color-border-hover)'}`,
                  flexShrink: 0,
                }}
              >
                {id && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/sprites/${id}/south.png`}
                    alt={cls.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* ── Class detail ─────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 8 }}>

          {/* Stat row */}
          <div className="flex items-center justify-between">
            {/* Left: sprite + name */}
            <div className="flex items-center" style={{ gap: 8 }}>
              {/* 56px container with 80px sprite centred (overflows) */}
              <div className="relative flex-shrink-0" style={{ width: 56, height: 56 }}>
                {spriteId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/sprites/${spriteId}/south.png`}
                    alt={selected.name}
                    style={{
                      position:        'absolute',
                      top:             '50%',
                      left:            '50%',
                      transform:       'translate(-50%, -50%)',
                      width:           80,
                      height:          80,
                      imageRendering:  'pixelated',
                      maxWidth:        'none',
                      objectFit:       'contain',
                    }}
                  />
                )}
              </div>

              {/* Name / level / role */}
              <div className="flex flex-col" style={{ gap: 4 }}>
                <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                  lv. 1
                </span>
                <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-md)', color: 'var(--color-primary)' }}>
                  {selected.name}
                </span>
                <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                  {selected.role}
                </span>
              </div>
            </div>

            {/* Right: stats grid */}
            <div className="flex items-start" style={{ gap: 8 }}>
              <div className="flex flex-col" style={{ gap: 8 }}>
                <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>HP: {stats.hp}</span>
                <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>ATK: {stats.atk}</span>
                <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>DEF: {stats.def}</span>
              </div>
              <div className="flex flex-col" style={{ gap: 8 }}>
                <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>Dex: {stats.dex}</span>
                <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>int: {stats.int}</span>
              </div>
            </div>
          </div>

          {/* Ability descriptions */}
          <div className="flex flex-col" style={{ gap: 16 }}>
            <p className="font-silkscreen leading-normal" style={{ fontSize: 11, color: 'var(--color-secondary)' }}>
              <span style={{ color: '#f59e0b' }}>normal attack</span>
              {` - ${selected.attackDesc}`}
            </p>
            <p className="font-silkscreen leading-normal" style={{ fontSize: 11, color: 'var(--color-secondary)' }}>
              <span style={{ color: '#f59e0b' }}>ability {selected.abilityName}</span>
              {` - ${selected.abilityDesc}`}
            </p>
            <p className="font-silkscreen leading-normal" style={{ fontSize: 11, color: 'var(--color-secondary)' }}>
              <span style={{ color: '#60a5fa' }}>passive {selected.passiveName}</span>
              {` - ${selected.passiveDesc}`}
            </p>
          </div>
        </div>

        {/* ── Buttons ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 20 }}>
          {state?.error && (
            <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
              {state.error}
            </p>
          )}

          <form action={action}>
            <input type="hidden" name="class"   value={selected.id} />
            <input type="hidden" name="crewId"  value={crewId} />
            <input type="hidden" name="welcome" value={welcome ? '1' : '0'} />
            {invite && <input type="hidden" name="invite" value={invite} />}
            <button
              type="submit"
              disabled={isPending}
              className="w-full flex items-center justify-center font-silkscreen text-primary bg-[var(--color-purple)] overflow-hidden disabled:opacity-40"
              style={{ fontSize: 'var(--text-xs)', height: 48, boxShadow: '4px 4px 0 rgba(168,85,247,0.5)' }}
            >
              {isPending ? '...' : 'Join the squad'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => router.push('/home')}
            className="w-full flex items-center justify-center font-silkscreen overflow-hidden"
            style={{ height: 48, fontSize: 'var(--text-xs)', color: 'var(--red)', border: '1px solid var(--red)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
