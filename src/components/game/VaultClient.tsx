'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { format, formatDistanceToNow } from 'date-fns'
import { toPng } from 'html-to-image'
import { ArtifactCard } from './ArtifactCard'
import type { Artifact, ArtifactRarity } from '@/types'
import type { ArtifactMeta } from '@/lib/game/artifacts'

// ─── Rarity colours ───────────────────────────────────────────────────────────

const RARITY_COLOR: Record<ArtifactRarity, string> = {
  common:    '#9e9e9e',
  rare:      '#448aff',
  epic:      '#bf5fff',
  legendary: '#ffd700',
}
const RARITY_BORDER: Record<ArtifactRarity, string> = {
  common:    'rgba(158,158,158,0.35)',
  rare:      'rgba(68,138,255,0.45)',
  epic:      'rgba(191,95,255,0.50)',
  legendary: 'rgba(255,215,0,0.60)',
}

// ─── Empty chest pixel art ────────────────────────────────────────────────────
const CHEST_GRID = [
  '0000000000000000','0001111111111000','0012222222222100','0012000000002100',
  '0012033333302100','0012033333302100','0011111111111100','0012000000002100',
  '0012000000002100','0012000000002100','0012000000002100','0001111111111000',
  '0000000000000000','0000000000000000','0000000000000000','0000000000000000',
]
const CHEST_COLORS: Record<string, string> = {
  '0':'transparent','1':'#5d3a1a','2':'#8b5e3c','3':'#c0a060','4':'#e0c88a',
}

function ChestEmpty() {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(16,4px)', width:64, height:64, imageRendering:'pixelated', opacity:0.4 }}>
      {CHEST_GRID.flatMap((row, r) =>
        row.split('').map((ch, c) => (
          <div key={`${r}-${c}`} style={{ backgroundColor: CHEST_COLORS[ch] ?? 'transparent' }} />
        ))
      )}
    </div>
  )
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────
type FilterTab = 'ALL' | 'RELICS' | 'GEAR' | 'LEGENDARY'

function matchesFilter(a: Artifact, tab: FilterTab): boolean {
  if (tab === 'ALL')       return true
  if (tab === 'LEGENDARY') return a.rarity === 'legendary'
  if (tab === 'GEAR')      return a.rarity === 'epic'
  return a.rarity === 'common' || a.rarity === 'rare'
}

// ─── Grid card ────────────────────────────────────────────────────────────────

function GridCard({ artifact, onClick }: { artifact: Artifact; onClick: () => void }) {
  const rarity   = artifact.rarity as ArtifactRarity
  const color    = RARITY_COLOR[rarity]  ?? '#9e9e9e'
  const border   = RARITY_BORDER[rarity] ?? 'rgba(158,158,158,0.35)'
  const meta     = (artifact.metadata ?? {}) as ArtifactMeta
  const bossName = meta.boss_name ?? 'THE VOID'
  const earnedAt = artifact.earned_at
    ? format(new Date(artifact.earned_at), 'MMM d').toUpperCase()
    : '—'

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="w-full text-left p-3 flex flex-col gap-2 cursor-pointer relative"
      style={{
        background: `linear-gradient(180deg, rgba(10,6,18,0.9) 0%, #0a0612 100%)`,
        border:     `1px solid ${border}`,
        boxShadow:  rarity === 'legendary' ? `0 0 12px ${color}44` : `0 0 6px ${color}22`,
        minHeight:  44,
      }}
    >
      {rarity === 'legendary' && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ opacity:[0.3,0.7,0.3] }}
          transition={{ duration:2, repeat:Infinity }}
          style={{ boxShadow:`inset 0 0 12px ${color}66` }}
        />
      )}

      <div className="font-pixel text-[7px] leading-snug line-clamp-2" style={{ color }}>
        {artifact.name}
      </div>

      <div className="flex items-center justify-between">
        <span
          className="font-pixel text-[6px] px-1.5 py-0.5"
          style={{ color, border:`1px solid ${border}`, background:`${color}15` }}
        >
          {rarity.toUpperCase()}
        </span>
        <span className="font-pixel text-[6px] text-[#3d2660]">{earnedAt}</span>
      </div>

      <p className="font-pixel text-[6px] text-[#3d2660]">VS {bossName}</p>
    </motion.button>
  )
}

// ─── Timeline entry ───────────────────────────────────────────────────────────

function TimelineEntry({ artifact, onClick }: { artifact: Artifact; onClick: () => void }) {
  const rarity   = artifact.rarity as ArtifactRarity
  const color    = RARITY_COLOR[rarity]  ?? '#9e9e9e'
  const border   = RARITY_BORDER[rarity] ?? 'rgba(158,158,158,0.35)'
  const meta     = (artifact.metadata ?? {}) as ArtifactMeta
  const bossName = meta.boss_name ?? 'THE VOID'
  const earnedAt = artifact.earned_at
    ? format(new Date(artifact.earned_at), 'MMM d, yyyy').toUpperCase()
    : '—'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 py-3 text-left"
      style={{ borderBottom: '1px solid rgba(26,26,46,0.6)', minHeight: 44 }}
    >
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <div className="w-2 h-2 rounded-full mt-1" style={{ background: color, boxShadow:`0 0 6px ${color}` }} />
        <div className="w-px flex-1 bg-[#1a1a2e]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-pixel text-[6px] text-[#3d2660] mb-1">{earnedAt}</p>
        <p className="font-pixel text-[7px] leading-snug mb-1" style={{ color }}>{artifact.name}</p>
        <p className="font-pixel text-[6px] text-[#4a3060]">VS {bossName}</p>
      </div>
      <span
        className="font-pixel text-[6px] px-1.5 py-0.5 flex-shrink-0"
        style={{ color, border:`1px solid ${border}`, background:`${color}15` }}
      >
        {rarity.toUpperCase()}
      </span>
    </button>
  )
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const cardRef  = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return
    setSharing(true)
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 })
      const link    = document.createElement('a')
      link.download  = `${artifact.name.replace(/\s+/g, '_')}.png`
      link.href      = dataUrl
      link.click()
    } catch {
      // share failed silently
    } finally {
      setSharing(false)
    }
  }, [artifact.name])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-start overflow-y-auto nexus-scroll"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background:'rgba(6,2,16,0.95)', backdropFilter:'blur(6px)' }}
    >
      {/* Close bar */}
      <div
        className="sticky top-0 z-10 w-full flex justify-between items-center px-4 py-3 bg-[#060210]"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <button
          onClick={onClose}
          className="font-pixel text-[8px] text-[#4a3060] hover:text-[#bf5fff] transition-colors"
          style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center' }}
        >
          ← BACK
        </button>
        <button
          onClick={handleShare}
          disabled={sharing}
          className="font-pixel text-[7px] px-3 py-1 disabled:opacity-40"
          style={{ color:'#00e5ff', border:'1px solid rgba(0,229,255,0.4)', background:'rgba(0,229,255,0.06)', minHeight: 44 }}
        >
          {sharing ? 'SAVING...' : '↓ SHARE'}
        </button>
      </div>

      <div ref={cardRef} className="w-full max-w-sm px-3 pb-8 bg-[#0a0612]">
        <ArtifactCard artifact={artifact} compact={false} />
      </div>
    </motion.div>
  )
}

// ─── VaultClient ──────────────────────────────────────────────────────────────

interface VaultClientProps {
  crewId:         string
  crewName:       string
  crewCreatedAt?: string
  artifacts:      Artifact[]
}

export function VaultClient({ crewId, crewName, crewCreatedAt, artifacts }: VaultClientProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL')
  const [viewMode,  setViewMode]  = useState<'grid' | 'timeline'>('grid')
  const [selected,  setSelected]  = useState<Artifact | null>(null)
  const goBack = useSlideBack()

  const filtered = artifacts.filter((a) => matchesFilter(a, activeTab))
  const TABS: FilterTab[] = ['ALL', 'RELICS', 'GEAR', 'LEGENDARY']

  return (
    <SlidePage className="flex flex-col bg-[#0a0612]" style={{ height: '100dvh', maxWidth: 480, margin: '0 auto' }}>

      {/* Header with safe area */}
      <div
        className="px-4 pb-2 flex-shrink-0"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 8px)',
          background: 'linear-gradient(180deg,rgba(191,95,255,0.08) 0%,transparent 100%)',
          borderBottom: '1px solid rgba(26,26,46,0.8)',
        }}
      >
        <div className="flex items-center h-10 gap-2">
          <button
            onClick={goBack}
            aria-label="Back"
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: 24, height: 40 }}
          >
            <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} />
          </button>
          <h1
            className="font-pixel text-[14px] text-[#bf5fff] leading-none"
            style={{ textShadow:'0 0 20px rgba(191,95,255,0.5)' }}
          >
            MEMORY VAULT
          </h1>
        </div>
        <p className="font-pixel text-[8px] text-[#4a3060] mt-0.5">{crewName.toUpperCase()}</p>
        <p className="font-pixel text-[7px] text-[#3d2660] mt-0.5">
          {artifacts.length} ARTIFACT{artifacts.length !== 1 ? 'S' : ''} — {artifacts.length} BOSS{artifacts.length !== 1 ? 'ES' : ''} SLAIN
        </p>
        {crewCreatedAt && (
          <p className="font-pixel text-[6px] text-[#2a1545] mt-0.5">
            CREW SINCE {format(new Date(crewCreatedAt), 'MMM d, yyyy').toUpperCase()}
            {' — '}
            {formatDistanceToNow(new Date(crewCreatedAt), { addSuffix: false }).toUpperCase()} OLD
          </p>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1a1a2e] flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="font-pixel text-[7px] px-2 py-1 transition-all"
            style={{
              color:      activeTab === tab ? '#0a0612' : '#4a3060',
              background: activeTab === tab ? '#bf5fff' : 'transparent',
              border:     `1px solid ${activeTab === tab ? '#bf5fff' : 'rgba(74,48,96,0.4)'}`,
              minHeight:  36,
            }}
          >
            {tab}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {(['grid','timeline'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="font-pixel text-[6px] px-2 py-1 transition-all"
              style={{
                color:        viewMode === mode ? '#00e5ff' : '#3d2660',
                borderBottom: `1px solid ${viewMode === mode ? '#00e5ff' : 'transparent'}`,
                minHeight:    36,
                minWidth:     36,
              }}
            >
              {mode === 'grid' ? '⊞' : '≡'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-4 nexus-scroll">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 pt-16">
            <ChestEmpty />
            <p className="font-pixel text-[8px] text-[#3d2660] text-center leading-relaxed">
              No artifacts yet.<br />Defeat a boss.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((a) => (
              <GridCard key={a.id} artifact={a} onClick={() => setSelected(a)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((a) => (
              <TimelineEntry key={a.id} artifact={a} onClick={() => setSelected(a)} />
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <DetailModal artifact={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </SlidePage>
  )
}
