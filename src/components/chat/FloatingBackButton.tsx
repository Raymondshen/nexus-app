'use client'

import Image from 'next/image'
import { useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { isSupabaseStorage } from '@/components/ui/Avatar'

interface FloatingBackButtonProps {
  crewImageUrl?: string | null
  crewName?:     string
}

export function FloatingBackButton({ crewImageUrl, crewName }: FloatingBackButtonProps) {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Go back"
      className="absolute left-4 z-[60] bg-surface border border-purple flex items-start flex-shrink-0"
      style={{
        top:       'max(calc(env(safe-area-inset-top) + 8px), 52px)',
        padding:   'var(--space-3)',
        gap:       'var(--space-3)',
        boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.8)',
      }}
    >
      <ChevronLeft
        style={{ width: 'var(--space-7)', height: 'var(--space-7)', color: 'var(--color-tertiary)' }}
        aria-hidden="true"
      />
      <div
        className="relative flex-shrink-0 overflow-hidden"
        style={{ width: 'var(--space-7)', height: 'var(--space-7)' }}
      >
        {crewImageUrl ? (
          <Image
            src={crewImageUrl}
            alt={crewName ?? 'Squad'}
            fill
            sizes="24px"
            className="object-cover"
            unoptimized={isSupabaseStorage(crewImageUrl)}
          />
        ) : (
          <div className="w-full h-full bg-purple" />
        )}
      </div>
    </button>
  )
}
