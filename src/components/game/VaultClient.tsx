'use client'

import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'

interface VaultClientProps {
  crewId:       string
  crewName:     string
  crewCreatedAt: string
}

export function VaultClient({ crewName }: VaultClientProps) {
  const goBack = useSlideBack()

  return (
    <SlidePage className="flex flex-col bg-black min-h-screen">
      {/* Header */}
      <div
        className="flex items-center flex-shrink-0"
        style={{
          paddingTop:    'calc(env(safe-area-inset-top, 0px) + 16px)',
          paddingLeft:   16,
          paddingRight:  16,
          paddingBottom: 16,
          gap:           12,
        }}
      >
        <button
          onClick={goBack}
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 24, height: 24 }}
          aria-label="Back"
        >
          <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
        </button>
        <div className="flex flex-col gap-0.5">
          <p className="font-pixel text-[8px] text-tertiary leading-none">THE VAULT</p>
          <p className="font-body font-black text-primary leading-none" style={{ fontSize: 16 }}>
            {crewName.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
        <p className="font-pixel text-[8px] text-[#2a1545] text-center leading-loose">
          Nothing here yet.<br />The vault awaits.
        </p>
      </div>
    </SlidePage>
  )
}
