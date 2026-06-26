'use client'

import { useState, useCallback } from 'react'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import {
  getAllAnnouncementsAction,
  updateAnnouncementAction,
  toggleAnnouncementAction,
  deleteAnnouncementAction,
} from '@/app/(app)/home/actions'
import type { Announcement } from '@/types'

function BackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex items-center justify-center flex-shrink-0"
      style={{ width: 24, height: 24 }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
    </button>
  )
}

interface AnnouncementsClientProps {
  initialAnnouncements: Announcement[]
}

export function AnnouncementsClient({ initialAnnouncements }: AnnouncementsClientProps) {
  const [banners,     setBanners]     = useState<Announcement[]>(initialAnnouncements)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await getAllAnnouncementsAction()
    setLoading(false)
    if ('data' in result) setBanners(result.data ?? [])
  }, [])

  async function handleUpdate(id: string) {
    if (!editingText.trim()) return
    const result = await updateAnnouncementAction(id, editingText.trim())
    if (result.error) { setError(result.error); return }
    setEditingId(null)
    reload()
  }

  async function handleToggle(id: string, active: boolean) {
    const result = await toggleAnnouncementAction(id, !active)
    if (result.error) setError(result.error)
    else reload()
  }

  async function handleDelete(id: string) {
    const result = await deleteAnnouncementAction(id)
    if (result.error) setError(result.error)
    else setBanners(prev => prev.filter(b => b.id !== id))
  }

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 w-full"
        style={{
          paddingLeft: 'var(--space-5)',
          paddingRight: 'var(--space-5)',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
          paddingBottom: 'var(--space-3)',
        }}
      >
        <div className="flex h-[40px] items-center" style={{ gap: 'var(--space-3)' }}>
          <BackButton />
          <p
            className="font-silkscreen text-primary uppercase leading-none"
            style={{ fontSize: 'var(--text-xl)' }}
          >
            Announcements
          </p>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          gap: 'var(--space-5)',
          padding: 'var(--space-5)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))',
        }}
      >
        {error && (
          <p className="font-pixel leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="font-pixel" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
            Loading...
          </p>
        ) : banners.length === 0 ? (
          <p className="font-pixel" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
            No announcements yet.
          </p>
        ) : (
          <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
            {banners.map((b) => (
              <div
                key={b.id}
                className="flex flex-col border"
                style={{
                  gap: 'var(--space-3)',
                  padding: 'var(--space-4)',
                  borderColor: b.active ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)',
                  background: b.active ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.02)',
                }}
              >
                {editingId === b.id ? (
                  <>
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value.slice(0, 500))}
                      className="w-full bg-black border px-3 py-2 font-body text-primary resize-none focus:outline-none focus:border-purple"
                      style={{ borderColor: 'var(--color-border)', fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                      rows={3}
                      maxLength={500}
                      autoFocus
                    />
                    <div className="flex" style={{ gap: 'var(--space-3)' }}>
                      <button
                        onClick={() => handleUpdate(b.id)}
                        className="flex-1 h-8 font-pixel border"
                        style={{ fontSize: 'var(--text-mini)', color: '#66bb6a', borderColor: 'rgba(102,187,106,0.4)', background: 'rgba(102,187,106,0.08)' }}
                      >
                        SAVE
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setError(null) }}
                        className="flex-1 h-8 font-pixel border"
                        style={{ fontSize: 'var(--text-mini)', color: 'var(--color-coins)', borderColor: 'rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.06)' }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p
                      className="font-body leading-snug"
                      style={{ fontSize: 'var(--text-sm)', color: b.active ? 'var(--color-primary)' : 'var(--color-muted)', fontVariationSettings: '"opsz" 14' }}
                    >
                      {b.text}
                    </p>
                    <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
                      <button
                        onClick={() => handleToggle(b.id, b.active)}
                        className="font-pixel px-2 py-1 border"
                        style={{
                          fontSize: 'var(--text-mini)',
                          color: b.active ? '#66bb6a' : 'var(--color-tertiary)',
                          borderColor: b.active ? 'rgba(102,187,106,0.4)' : 'rgba(161,161,170,0.3)',
                          background: b.active ? 'rgba(102,187,106,0.08)' : 'rgba(161,161,170,0.06)',
                        }}
                      >
                        {b.active ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                      <button
                        onClick={() => { setEditingId(b.id); setEditingText(b.text); setError(null) }}
                        className="font-pixel px-2 py-1 border"
                        style={{ fontSize: 'var(--text-mini)', color: 'var(--color-coins)', borderColor: 'rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.06)' }}
                      >
                        EDIT
                      </button>
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="font-pixel px-2 py-1 border ml-auto"
                        style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}
                      >
                        DELETE
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SlidePage>
  )
}
