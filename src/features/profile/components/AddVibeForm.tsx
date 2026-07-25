'use client'

import { useState, useTransition } from 'react'
import { addNoteAction } from '@/app/(app)/profile/notes/actions'
import { InputField } from '@/shared/components/ui/InputField'
import { isMusicUrl } from '@/features/profile/components/vibesShared'
import type { PublicNote } from '@/types'

// ─── AddVibeForm — Music Link input + ADD VIBE button ─────────────────────────
// Extracted from UploadOptionsSheet's "Add Vibes" section so the same validated
// add-a-vibe flow can also back VibesPlaylistSheet's inline "Add Music" field
// (Figma 690:16468) without duplicating the isMusicUrl check / addNoteAction call.

interface AddVibeFormProps {
  /** Field label — "Music Link" (UploadOptionsSheet) or "Add Music" (VibesPlaylistSheet). */
  label?:      string
  crews:       Array<{ id: string; name: string }>
  onVibeAdded: (note: PublicNote) => void
  /** Called after a successful add, e.g. to close the enclosing sheet. Omit to keep it open (input just clears). */
  onAdded?:    () => void
}

export function AddVibeForm({ label = 'Music Link', crews, onVibeAdded, onAdded }: AddVibeFormProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, startAdd] = useTransition()

  function handleAdd() {
    const trimmed = url.trim()
    if (!trimmed) { setError('Paste a link first'); return }
    if (!isMusicUrl(trimmed)) {
      setError('Only YouTube, Spotify, Apple Music, or SoundCloud')
      return
    }
    const crewId = crews[0]?.id
    if (!crewId) { setError('Join a squad first to save vibes'); return }

    startAdd(async () => {
      const result = await addNoteAction(crewId, trimmed)
      if (result.error) { setError('Failed to add — try again'); return }
      if (result.note) {
        setUrl('')
        onVibeAdded(result.note)
        onAdded?.()
      }
    })
  }

  return (
    <div className="flex flex-col w-full" style={{ gap: 'var(--x3)' }}>
      <InputField
        label={label}
        value={url}
        onChange={(v) => { setUrl(v); setError(null) }}
        placeholder="Paste music link here..."
        helperText="e.g. Youtube, Youtube Music, Spotify, Apple Music, etc..."
        autoComplete="off"
      />
      {error && (
        <p className="font-pixel" style={{ fontSize: 8, color: 'var(--color-danger)' }}>{error}</p>
      )}
      <button
        onClick={handleAdd}
        disabled={adding || !url.trim()}
        className="w-full flex items-center justify-center disabled:opacity-50"
        style={{ height: 48, background: 'var(--color-purple)' }}
      >
        <span className="font-silkscreen leading-none text-primary whitespace-nowrap" style={{ fontSize: 'var(--xs)' }}>
          {adding ? '...' : 'ADD VIBE'}
        </span>
      </button>
    </div>
  )
}
