'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Braces } from 'pixelarticons/react/Braces'
import { isSupabaseStorage } from '@/components/ui/Avatar'

interface FloatingBackButtonProps {
  crewImageUrl?: string | null
  crewName?:     string
  crewId:        string
}

export function FloatingBackButton({ crewImageUrl, crewName, crewId }: FloatingBackButtonProps) {
  const goBack = useSlideBack()
  const router = useRouter()

  return (
    <div
      className="absolute left-4 z-[60] flex items-center gap-2 pointer-events-none"
      style={{ top: 'max(calc(env(safe-area-inset-top) + 8px), 52px)' }}
    >
      {/* Back + crew image pill */}
      <button
        onClick={goBack}
        aria-label="Go back"
        className="pointer-events-auto flex items-center gap-2 bg-surface border border-purple flex-shrink-0"
        style={{ padding: 'var(--space-3)', boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.8)' }}
      >
        <ChevronLeft
          style={{ width: 'var(--space-7)', height: 'var(--space-7)', color: 'var(--color-purple)' }}
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

      {/* Squad glossary button */}
      <button
        onClick={() => router.push(`/chat/${crewId}/definitions`)}
        aria-label="Squad glossary"
        className="pointer-events-auto flex items-center justify-center bg-surface border border-purple flex-shrink-0"
        style={{ padding: 'var(--space-3)', boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.8)' }}
      >
        <Braces
          style={{ width: 'var(--space-7)', height: 'var(--space-7)', color: 'var(--color-purple)' }}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
