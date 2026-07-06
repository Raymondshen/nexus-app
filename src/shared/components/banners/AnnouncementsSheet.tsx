'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { BottomSheet } from '@/shared/components/ui/BottomSheet'
import { AnnouncementCard } from './AnnouncementCard'

export interface AnnouncementItem {
  id:         string
  title:      string
  text:       string
  image_url:  string
  created_at: string
}

const STORAGE_KEY = 'nexus_dismissed_banners'

function getDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]) }
  catch { return new Set() }
}

// Figma 419:1930 — "what's new" sheet, nexus-gradient background (an explicit
// exception to BottomSheet's default solid --color-surface-sheet).
export function AnnouncementsSheet({ announcements }: { announcements: AnnouncementItem[] }) {
  const [visible, setVisible] = useState<AnnouncementItem[] | null>(null) // null = dismissed-state not checked yet

  useEffect(() => {
    const dismissed = getDismissed()
    setVisible(announcements.filter(a => !dismissed.has(a.id)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function dismissAll() {
    if (!visible || visible.length === 0) return
    const dismissed = getDismissed()
    for (const a of visible) dismissed.add(a.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]))
    setVisible([])
  }

  const showSheet = !!visible && visible.length > 0

  return (
    <AnimatePresence>
      {showSheet && (
        <BottomSheet
          onClose={dismissAll}
          zIndex={80}
          maxHeight="85vh"
          background="var(--gradient-nexus)"
          className="overflow-y-auto nexus-scroll px-[var(--space-5)]"
        >
          <div
            className="w-full flex flex-col items-center"
            style={{ gap: 'var(--space-5)', paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-8))' }}
          >
            <div className="w-full flex flex-col items-start" style={{ gap: 'var(--space-3)' }}>
              <p className="font-silkscreen leading-none text-tertiary" style={{ fontSize: 'var(--text-mini)' }}>
                Boom!
              </p>
              <p
                className="w-full font-body font-bold leading-none text-primary"
                style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
              >
                Latest Updates...
              </p>
            </div>

            {visible!.map((a) => (
              <AnnouncementCard key={a.id} title={a.title} text={a.text} imageUrl={a.image_url} createdAt={a.created_at} />
            ))}

            <button
              onClick={dismissAll}
              className="w-full flex items-center justify-center bg-purple rounded-[8px]"
              style={{ padding: 'var(--space-5)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <span
                className="font-body font-semibold text-primary leading-none"
                style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.2px' }}
              >
                Dismiss
              </span>
            </button>
          </div>
        </BottomSheet>
      )}
    </AnimatePresence>
  )
}
