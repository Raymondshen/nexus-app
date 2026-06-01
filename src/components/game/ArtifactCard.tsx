'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import type { Artifact, ArtifactRarity } from '@/types'
import type { ArtifactMeta } from '@/lib/game/artifacts'

// ─── Rarity config ────────────────────────────────────────────────────────────

const RARITY: Record<ArtifactRarity, { label: string; color: string; border: string; glow: string; shadow: string }> = {
  common:    { label: 'COMMON',    color: '#9e9e9e', border: 'rgba(158,158,158,0.35)', glow: 'rgba(158,158,158,0.08)', shadow: 'rgba(158,158,158,0.25)' },
  rare:      { label: 'RARE',      color: '#448aff', border: 'rgba(68,138,255,0.45)',  glow: 'rgba(68,138,255,0.10)',  shadow: 'rgba(68,138,255,0.30)'  },
  epic:      { label: 'EPIC',      color: '#bf5fff', border: 'rgba(191,95,255,0.50)', glow: 'rgba(191,95,255,0.12)', shadow: 'rgba(191,95,255,0.35)'  },
  legendary: { label: 'LEGENDARY', color: '#ffd700', border: 'rgba(255,215,0,0.60)',  glow: 'rgba(255,215,0,0.18)',  shadow: 'rgba(255,215,0,0.45)'   },
}

// ─── Pixel icons (16×16 grids) ────────────────────────────────────────────────

// Common — sword: 1=blade 2=guard 3=handle
const SWORD = [
  '0000001100000000','0000001100000000','0000001100000000','0000001100000000',
  '0000001100000000','0000001100000000','0000001100000000','0000001100000000',
  '0001122211000000','0000001100000000','0000003300000000','0000033330000000',
  '0000033330000000','0000033330000000','0000000000000000','0000000000000000',
]
const SWORD_C: Record<string,string> = { '0':'transparent','1':'#d0d0d0','2':'#808080','3':'#8b5e3c' }

// Rare — orb: 1=body 2=mid 3=core
const ORB = [
  '0000011100000000','0000111110000000','0001122210000000','0011233210000000',
  '0012333210000000','0012333210000000','0011233210000000','0001122110000000',
  '0000111110000000','0000011100000000','0000010000000000','0000111000000000',
  '0000010000000000','0000000000000000','0000000000000000','0000000000000000',
]
const ORB_C: Record<string,string>   = { '0':'transparent','1':'#448aff','2':'#82b1ff','3':'#e3f2fd' }

// Epic — winged crest: 1=wing 2=body 3=highlight 4=gem
const CREST = [
  '1000000000000010','1100000000000110','0110002220001100','0011002220011000',
  '0001122221100100','0000124421000000','0001122221100000','0000122221000000',
  '0000112210000000','0000011100000000','0000001100000000','0000011100000000',
  '0000001000000000','0000000000000000','0000000000000000','0000000000000000',
]
const CREST_C: Record<string,string> = { '0':'transparent','1':'#bf5fff','2':'#ffd700','3':'#fff3a0','4':'#00e5ff' }

// Legendary — crown: 1=gold 2=cyan gem 3=purple gem 4=highlight
const CROWN = [
  '0000000000000000','1000100010001000','1100110011001100','1111111111111100',
  '1244414444241100','1421442441241100','1444444444441100','1444444444441100',
  '0111111111110000','0000000000000000','0000000000000000','0000000000000000',
  '0000000000000000','0000000000000000','0000000000000000','0000000000000000',
]
const CROWN_C: Record<string,string> = { '0':'transparent','1':'#ffd700','2':'#00e5ff','3':'#bf5fff','4':'#fff8a0' }

// SageMage — victory pose: 1=robe 2=arcane 3=hat 4=skin
const SAGE = [
  '0000033000000000','0000333300000000','0000333300000000','0001133110000000',
  '0000133100000000','0001144411000000','0001244421000000','0001244421000000',
  '0000114110000000','0000114110000000','0001114111000000','0000114110000000',
  '0000114110000000','0001100011000000','0011000011100000','0000000000000000',
]
const SAGE_C: Record<string,string>  = { '0':'transparent','1':'#bf5fff','2':'#00e5ff','3':'#7b2fa8','4':'#e0c88a' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PixelIcon({ grid, colors, size = 48 }: { grid: string[]; colors: Record<string,string>; size?: number }) {
  const cell = size / 16
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(16,${cell}px)`, width:size, height:size, imageRendering:'pixelated' }}>
      {grid.flatMap((row, r) =>
        row.split('').map((ch, c) => (
          <div key={`${r}-${c}`} style={{ backgroundColor: colors[ch] ?? 'transparent' }} />
        ))
      )}
    </div>
  )
}

function SageMageVictory() {
  return (
    <div className="relative">
      <motion.div
        animate={{ y:[-2,2,-2], rotate:[-2,2,-2] }}
        transition={{ duration:1.6, repeat:Infinity, ease:'easeInOut' }}
      >
        <PixelIcon grid={SAGE} colors={SAGE_C} size={64} />
      </motion.div>
      {([0,1,2] as const).map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width:6, height:6,
            background:   i%2===0 ? '#bf5fff' : '#00e5ff',
            boxShadow:    `0 0 6px ${i%2===0?'#bf5fff':'#00e5ff'}`,
            left:         [8,52,28][i],
            top:          [14,8,52][i],
          }}
          animate={{ y:[-6,6,-6], x:[4,-4,4], opacity:[0.5,1,0.5] }}
          transition={{ duration:1.8+i*0.4, repeat:Infinity, delay:i*0.5, ease:'easeInOut' }}
        />
      ))}
    </div>
  )
}

// ─── Typewriter ───────────────────────────────────────────────────────────────

function useTypewriter(text: string, startAt: number, msPerChar = 55) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>
    const timer = setTimeout(() => {
      let i = 0
      intervalId = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) clearInterval(intervalId)
      }, msPerChar)
    }, startAt)
    return () => { clearTimeout(timer); clearInterval(intervalId) }
  }, [text, startAt, msPerChar])
  return displayed
}

// ─── ArtifactCard ─────────────────────────────────────────────────────────────

export interface ArtifactCardProps {
  artifact: Artifact
  compact?: boolean
}

export function ArtifactCard({ artifact, compact = false }: ArtifactCardProps) {
  const rarity = artifact.rarity as ArtifactRarity
  const cfg    = RARITY[rarity] ?? RARITY.common
  const meta   = (artifact.metadata ?? {}) as ArtifactMeta

  const isSageMage    = meta.is_sage_mage === true
  const bossName      = meta.boss_name ?? 'THE VOID'
  const participants  = meta.participant_names ?? []
  const mvpUsername   = meta.mvp_username ?? null
  const typedName     = useTypewriter(artifact.name, compact ? 0 : 1000, compact ? 0 : 55)

  const { grid, colors } = rarity === 'legendary' ? { grid: CROWN, colors: CROWN_C }
    : rarity === 'epic'  ? { grid: CREST, colors: CREST_C }
    : rarity === 'rare'  ? { grid: ORB,   colors: ORB_C   }
    :                      { grid: SWORD, colors: SWORD_C  }

  const earnedDate = artifact.earned_at
    ? format(new Date(artifact.earned_at), 'MMM d, yyyy').toUpperCase()
    : '—'

  // ── Compact (vault grid card) ────────────────────────────────────────────────
  if (compact) {
    return (
      <div
        className="w-full p-3 flex items-center gap-3"
        style={{
          background:  `linear-gradient(180deg, ${cfg.glow} 0%, #0a0612 100%)`,
          border:      `1px solid ${cfg.border}`,
          boxShadow:   `0 0 10px ${cfg.shadow}`,
        }}
      >
        <PixelIcon grid={grid} colors={colors} size={32} />
        <div className="flex-1 min-w-0">
          <p className="font-pixel text-[7px] leading-tight truncate" style={{ color: cfg.color }}>
            {artifact.name}
          </p>
          <span
            className="font-pixel text-[6px] px-1.5 py-0.5 mt-1 inline-block"
            style={{ color: cfg.color, border:`1px solid ${cfg.border}`, background: cfg.glow }}
          >
            {cfg.label}
          </span>
          <p className="font-pixel text-[6px] text-[#3d2660] mt-1">{earnedDate}</p>
        </div>
      </div>
    )
  }

  // ── Full reveal card (chat inline) ───────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full my-3 overflow-hidden relative"
      style={{
        background: `linear-gradient(180deg, ${cfg.glow} 0%, #060310 80%, #0a0612 100%)`,
        border:     `1px solid ${cfg.border}`,
        boxShadow:  `0 0 30px ${cfg.shadow}, 0 0 60px ${cfg.shadow.replace(/[\d.]+\)$/, '0.08)')}, inset 0 1px 0 ${cfg.border}`,
      }}
    >
      {/* Scanlines */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{ background: 'repeating-linear-gradient(to bottom,transparent 0px,transparent 3px,rgba(0,0,0,0.12) 3px,rgba(0,0,0,0.12) 4px)' }}
      />

      {/* Legendary pulsing glow */}
      {rarity === 'legendary' && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={{ opacity:[0.25,0.65,0.25] }}
          transition={{ duration:2.4, repeat:Infinity, ease:'easeInOut' }}
          style={{ boxShadow: `inset 0 0 28px ${cfg.shadow}` }}
        />
      )}

      {/* BOSS DEFEATED flash overlay */}
      <motion.div
        className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ times:[0,0.15,0.65,1], duration:0.9, delay:0.4 }}
      >
        <div className="absolute inset-0" style={{ background:'rgba(0,0,0,0.82)' }} />
        <p
          className="font-pixel text-[14px] relative z-10 text-center leading-relaxed"
          style={{ color:'#ffffff', textShadow:`0 0 24px ${cfg.color}, 0 0 48px ${cfg.color}` }}
        >
          BOSS<br />DEFEATED
        </p>
      </motion.div>

      {/* Screen flash at peak */}
      <motion.div
        className="absolute inset-0 z-40 pointer-events-none"
        style={{ background:'white' }}
        initial={{ opacity: 0 }}
        animate={{ opacity:[0, 0, 0.55, 0] }}
        transition={{ times:[0,0.4,0.55,1], duration:0.5, delay:0.7 }}
      />

      {/* Card content */}
      <div className="relative z-20 p-4">

        {/* Rarity badge */}
        <motion.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration:0.35, delay:1.5, type:'spring', stiffness:220, damping:18 }}
          className="flex justify-center mb-3"
        >
          <span
            className="font-pixel text-[8px] px-3 py-1 tracking-widest"
            style={{ color:cfg.color, border:`1px solid ${cfg.border}`, background:cfg.glow, boxShadow:`0 0 14px ${cfg.shadow}` }}
          >
            ★ {cfg.label} ★
          </span>
        </motion.div>

        {/* Pixel icon */}
        <motion.div
          initial={{ scale:0, rotate:180, opacity:0 }}
          animate={{ scale:1, rotate:0, opacity:1 }}
          transition={{ duration:0.45, delay:2.0, type:'spring', stiffness:160, damping:16 }}
          className="flex justify-center mb-4"
        >
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full blur-2xl"
              style={{ background:`radial-gradient(circle,${cfg.glow} 0%,transparent 70%)`, transform:'scale(2.5)' }}
            />
            {isSageMage ? (
              <SageMageVictory />
            ) : (
              <motion.div
                animate={{ filter:[`drop-shadow(0 0 4px ${cfg.color})`,`drop-shadow(0 0 12px ${cfg.color})`,`drop-shadow(0 0 4px ${cfg.color})`] }}
                transition={{ duration:2.2, repeat:Infinity, ease:'easeInOut', delay:3.0 }}
              >
                <PixelIcon grid={grid} colors={colors} size={48} />
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Artifact name (typewriter) */}
        <div className="text-center mb-4 min-h-[1.8rem]">
          <p
            className="font-pixel text-[10px] leading-relaxed"
            style={{ color:cfg.color, textShadow:`0 0 10px ${cfg.shadow}` }}
          >
            {typedName}
            {typedName.length < artifact.name.length && (
              <motion.span animate={{ opacity:[1,0] }} transition={{ duration:0.48, repeat:Infinity }}>▊</motion.span>
            )}
          </p>
        </div>

        {/* Stats / bonuses / crew info */}
        <motion.div
          initial={{ opacity:0 }}
          animate={{ opacity:1 }}
          transition={{ duration:0.5, delay:2.5 }}
          className="space-y-2"
        >
          {meta.passive_bonus && (
            <div className="px-3 py-2" style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.05)' }}>
              <p className="font-pixel text-[6px] text-[#4a3060] mb-1">PASSIVE</p>
              <p className="font-pixel text-[7px]" style={{ color:cfg.color }}>{meta.passive_bonus}</p>
            </div>
          )}

          {meta.active_bonus && (
            <div className="px-3 py-2" style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.05)' }}>
              <p className="font-pixel text-[6px] text-[#4a3060] mb-1">ACTIVE</p>
              <p className="font-pixel text-[7px]" style={{ color:cfg.color }}>{meta.active_bonus}</p>
            </div>
          )}

          {meta.lore && (
            <p className="text-[11px] text-[#5a4070] italic font-sans leading-relaxed text-center px-2 py-1">
              &ldquo;{meta.lore}&rdquo;
            </p>
          )}

          <div className="px-3 py-2" style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className="font-pixel text-[6px] text-[#4a3060] mb-1">EARNED BY</p>
                <p className="font-pixel text-[7px] text-[#6b4f8f] leading-relaxed">
                  {participants.length > 0 ? participants.join(', ') : 'THE CREW'}
                </p>
              </div>
              {mvpUsername && (
                <div className="text-right flex-shrink-0">
                  <p className="font-pixel text-[6px] text-[#4a3060] mb-1">MVP ♛</p>
                  <p className="font-pixel text-[7px]" style={{ color:cfg.color }}>{mvpUsername}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center px-1">
            <p className="font-pixel text-[6px] text-[#3d2660]">{earnedDate}</p>
            <p className="font-pixel text-[6px] text-[#3d2660]">VS {bossName}</p>
          </div>

          <motion.div
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            transition={{ duration:0.5, delay:3.2 }}
            className="text-center pt-1"
          >
            <motion.p
              animate={{ opacity:[0.7,1,0.7] }}
              transition={{ duration:2, repeat:Infinity, delay:3.2 }}
              className="font-pixel text-[7px]"
              style={{ color:'#66bb6a', textShadow:'0 0 8px rgba(102,187,106,0.5)' }}
            >
              ✓ SAVED TO VAULT
            </motion.p>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}
