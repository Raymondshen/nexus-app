'use client'

import { useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { NotesGrid } from '@/app/(app)/profile/notes/NotesGrid'
import type { PublicNote } from '@/types'

interface Props {
  crewId:       string
  userId:       string
  viewerId:     string
  username:     string
  initialNotes: PublicNote[]
  notesCrews:   Array<{ id: string; name: string }>
}

export function AccountPageMember({
  crewId,
  viewerId,
  username,
  initialNotes,
  notesCrews,
}: Props) {
  const goBack = useSlideBack()

  return (
    <>
      {/* ── Nav bar ───────────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center gap-3 bg-black border-b border-border"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)', paddingBottom: 14, paddingLeft: 16, paddingRight: 16 }}
      >
        <button onClick={goBack} aria-label="Back" className="flex items-center justify-center" style={{ width: 24, height: 24 }}>
          <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
        </button>
        <p className="font-body font-bold truncate" style={{ fontSize: 16, fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
          {username}
        </p>
      </div>

      {/* ── Board (fills remaining space) ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <NotesGrid
          viewerId={viewerId}
          initialNotes={initialNotes}
          initialSections={[]}
          crews={notesCrews}
          initialCrewId={crewId}
          lockCrew={false}
        />
      </div>
    </>
  )
}
