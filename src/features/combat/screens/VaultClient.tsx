'use client'

import { useState, useEffect } from 'react'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { createClient } from '@/shared/supabase/client'

interface ArtifactRow {
  id:          string
  name:        string
  rarity:      'common' | 'rare' | 'epic' | 'legendary'
  earned_at:   string
  mvp_user_id: string | null
  asset_type:  string | null
  metadata:    Record<string, unknown> | null
}

const RARITY_COLOR: Record<string, string> = {
  common:    '#71717a',
  rare:      '#3b82f6',
  epic:      '#bf5fff',
  legendary: '#ffd700',
}

const RARITY_GLOW: Record<string, string> = {
  common:    'transparent',
  rare:      '#3b82f644',
  epic:      '#bf5fff44',
  legendary: '#ffd70066',
}

function ArtifactCard({ artifact }: { artifact: ArtifactRow }) {
  const color = RARITY_COLOR[artifact.rarity] ?? '#71717a'
  const glow  = RARITY_GLOW[artifact.rarity] ?? 'transparent'
  const ts    = new Date(artifact.earned_at)

  return (
    <div
      className="flex flex-col gap-2 p-3"
      style={{
        background:  `linear-gradient(135deg, #0f0820 0%, #1a0d2e 100%)`,
        border:      `1px solid ${color}44`,
        boxShadow:   `0 0 12px ${glow}`,
      }}
    >
      {/* Rarity + name */}
      <div>
        <p className="font-pixel leading-none mb-1" style={{ fontSize: 5, color }}>
          {artifact.rarity.toUpperCase()}
        </p>
        <p className="font-silkscreen leading-snug" style={{ fontSize: 9, color: 'var(--color-primary)' }}>
          {artifact.name}
        </p>
      </div>

      {/* Pixel art artifact icon — placeholder rune using emoji */}
      <div
        className="flex items-center justify-center"
        style={{
          width: '100%',
          height: 48,
          background: `${color}0a`,
          border:     `1px solid ${color}22`,
          fontSize:   28,
        }}
      >
        {artifact.rarity === 'legendary' ? '🏆' : artifact.rarity === 'epic' ? '💎' : artifact.rarity === 'rare' ? '🔷' : '📦'}
      </div>

      {/* Date */}
      <p className="font-pixel leading-none" style={{ fontSize: 5, color: 'var(--color-tertiary)' }}>
        {ts.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' })}
      </p>
    </div>
  )
}

interface VaultClientProps {
  crewId:       string
  crewName:     string
  crewCreatedAt: string
}

export function VaultClient({ crewId, crewName }: VaultClientProps) {
  const goBack    = useSlideBack()
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    createClient()
      .from('artifacts')
      .select('id, name, rarity, earned_at, mvp_user_id, asset_type, metadata')
      .eq('crew_id', crewId)
      .order('earned_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setArtifacts((data ?? []) as ArtifactRow[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [crewId])

  const legendary = artifacts.filter((a) => a.rarity === 'legendary')
  const epic      = artifacts.filter((a) => a.rarity === 'epic')
  const rare      = artifacts.filter((a) => a.rarity === 'rare')
  const common    = artifacts.filter((a) => a.rarity === 'common')

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
        {!loading && artifacts.length > 0 && (
          <span className="font-silkscreen ml-auto" style={{ fontSize: 8, color: 'var(--color-tertiary)' }}>
            {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-pixel text-[7px] text-tertiary">Loading...</p>
        </div>
      ) : artifacts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          <p className="font-pixel text-center leading-loose" style={{ fontSize: 8, color: '#2a1545' }}>
            Nothing here yet.<br />The vault awaits.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto nexus-scroll px-4 pb-8" style={{ gap: 24 }}>
          {/* Stats strip */}
          <div className="flex items-center gap-4 py-4 border-b border-border mb-4">
            {([['legendary', legendary.length], ['epic', epic.length], ['rare', rare.length], ['common', common.length]] as const).map(([r, n]) => (
              <div key={r} className="flex flex-col items-center gap-0.5">
                <span className="font-silkscreen" style={{ fontSize: 11, color: RARITY_COLOR[r] }}>{n}</span>
                <span className="font-pixel" style={{ fontSize: 5, color: 'var(--color-tertiary)' }}>{r.toUpperCase()}</span>
              </div>
            ))}
          </div>

          {/* Artifact grid */}
          <div className="grid grid-cols-2 gap-3">
            {artifacts.map((a) => (
              <ArtifactCard key={a.id} artifact={a} />
            ))}
          </div>
        </div>
      )}
    </SlidePage>
  )
}
