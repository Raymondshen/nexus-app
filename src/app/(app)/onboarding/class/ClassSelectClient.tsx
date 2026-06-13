'use client'

import { useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { PixelSprite, spriteInfoFor } from '@/components/game/PixelSprite'
import { Button } from '@/components/ui/Button'
import { selectClassAction } from './actions'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import type { AvatarClass } from '@/types'

const CLASSES: { id: AvatarClass; name: string; flavor: string; color: string }[] = [
  { id: 'mage',    name: 'MAGE',    flavor: 'Channel arcane fire. Knowledge is power.',  color: '#00e5ff' },
  { id: 'warrior', name: 'WARRIOR', flavor: 'First to fight. Last to fall.',              color: '#ff4444' },
  { id: 'rogue',   name: 'ROGUE',   flavor: 'Strike from darkness. Always unseen.',       color: '#bf5fff' },
  { id: 'healer',  name: 'HEALER',  flavor: 'Keep the crew alive. Support wins wars.',    color: '#66bb6a' },
  { id: 'archer',  name: 'ARCHER',  flavor: 'Never misses. Strikes before the enemy blinks.', color: '#ffd700' },
]

function ClassCard({
  cls,
  selected,
  onSelect,
}: {
  cls: (typeof CLASSES)[number]
  selected: AvatarClass | null
  onSelect: (id: AvatarClass) => void
}) {
  const spriteInfo = spriteInfoFor(cls.id)
  const isSelected = selected === cls.id

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(cls.id)}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="w-full flex flex-col items-center gap-2 p-4 border-2 transition-colors duration-150 cursor-pointer"
      style={{
        background:  isSelected ? `color-mix(in srgb, ${cls.color} 8%, #0f0820)` : '#0f0820',
        borderColor: isSelected ? cls.color : '#2a1545',
        boxShadow:   isSelected ? `0 0 20px ${cls.color}33` : 'none',
      }}
    >
      <div className="h-[128px] flex items-center justify-center">
        {spriteInfo ? (
          <PixelSprite
            spriteId={spriteInfo.id}
            nativePx={spriteInfo.nativePx}
            scale={4}
            animate={isSelected}
            direction={isSelected ? undefined : 'south'}
          />
        ) : (
          <div className="w-[96px] h-[96px] border border-[#2a1545] flex items-center justify-center">
            <span className="font-pixel text-[8px] text-[#6b4f8f]">?</span>
          </div>
        )}
      </div>

      <span className="font-pixel text-[9px]" style={{ color: isSelected ? cls.color : '#ffffff' }}>
        {cls.name}
      </span>

      <span className="font-pixel text-[7px] text-[#6b4f8f] text-center leading-relaxed">
        {cls.flavor}
      </span>
    </motion.button>
  )
}

export default function ClassSelectClient({
  crewId,
  welcome,
  invite,
}: {
  crewId: string
  welcome: boolean
  invite: string | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<AvatarClass | null>(null)
  const [state, action, isPending] = useActionState(selectClassAction, null)

  return (
    <div className="min-h-screen bg-[#0a0612] flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)',
        }}
      />

      <button
        onClick={() => router.replace('/home')}
        className="absolute top-4 left-4 z-20 p-1"
        aria-label="Back"
      >
        <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
      </button>

      <div className="relative z-10 w-full max-w-[390px]">
        <div className="text-center mb-8">
          <h1
            className="font-pixel text-3xl text-[#bf5fff] tracking-wider mb-3"
            style={{ textShadow: '0 0 30px rgba(191,95,255,0.9), 0 0 60px rgba(191,95,255,0.4)' }}
          >
            NEXUS
          </h1>
          <h2 className="font-pixel text-[11px] text-white mb-2">CHOOSE YOUR CLASS</h2>
          <p className="font-pixel text-[8px] text-[#6b4f8f]">Your legend begins here.</p>
        </div>

        {state?.error && (
          <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2 mb-4">
            <p className="font-pixel text-[9px] text-[#ff4444]">{state.error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          {CLASSES.slice(0, 4).map((cls) => (
            <ClassCard key={cls.id} cls={cls} selected={selected} onSelect={setSelected} />
          ))}
        </div>

        <div className="flex justify-center mb-6">
          <div style={{ width: 'calc(50% - 6px)' }}>
            <ClassCard cls={CLASSES[4]} selected={selected} onSelect={setSelected} />
          </div>
        </div>

        <form action={action}>
          <input type="hidden" name="class"   value={selected ?? ''} />
          <input type="hidden" name="crewId"  value={crewId} />
          <input type="hidden" name="welcome" value={welcome ? '1' : '0'} />
          {invite && <input type="hidden" name="invite" value={invite} />}
          <Button
            type="submit"
            variant="primary"
            loading={isPending}
            disabled={!selected}
            className="w-full"
          >
            ENTER THE NEXUS
          </Button>
        </form>
      </div>
    </div>
  )
}
