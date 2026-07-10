'use client'

import { useState, useLayoutEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { PixelSprite, spriteInfoFor } from '@/shared/components/game/PixelSprite'
import { Crown } from 'pixelarticons/react/Crown'
import { Message } from 'pixelarticons/react/Message'
import { VinylPill } from '@/shared/components/ui/VinylPill'

const CLASS_LABELS: Record<string, string> = {
  berserker: 'Berserker', sage: 'Sage', ghost: 'Ghost', hype_man: 'Hype Man',
  the_voice: 'The Voice', meme_lord: 'Meme Lord', mage: 'Mage', warrior: 'Warrior',
  rogue: 'Rogue', healer: 'Healer', archer: 'Archer',
}

export type MiniMember = {
  id:             string
  username:       string
  avatar_url:     string | null
  avatar_class:   string | null | undefined
  background_url: string | null
  status?:        string | null
}

function StatusTicker({ status }: { status: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRef      = useRef<HTMLSpanElement>(null)
  const [numCopies, setNumCopies] = useState(6)
  const [animPx,    setAnimPx]    = useState(0)

  useLayoutEffect(() => {
    const container = containerRef.current
    const item      = itemRef.current
    if (!container || !item) return
    const cw = container.clientWidth
    const iw = item.offsetWidth
    if (iw <= 0) return
    const halfNeeded = Math.ceil(cw / iw) + 1
    const n          = Math.max(4, halfNeeded % 2 === 0 ? halfNeeded * 2 : (halfNeeded + 1) * 2)
    setNumCopies(n)
    setAnimPx(iw * (n / 2))
  }, [status])

  const duration = Math.max(11, status.length * 0.28 + 5)

  return (
    <div
      ref={containerRef}
      className="overflow-hidden border-t border-b border-border px-2"
      style={{ paddingTop: 12, paddingBottom: 12 }}
    >
      <motion.div
        key={status}
        className="flex"
        initial={{ x: 0 }}
        animate={{ x: animPx > 0 ? [0, -animPx] : 0 }}
        transition={{ duration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
      >
        {Array.from({ length: numCopies }, (_, i) => (
          <span
            key={i}
            ref={i === 0 ? itemRef : undefined}
            className="inline-flex items-center flex-shrink-0 whitespace-nowrap"
            style={{ gap: 8, paddingRight: 8 }}
          >
            <span className="inline-flex items-center flex-shrink-0" style={{ gap: 4 }}>
              <Message style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />
              <span className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none">
                &ldquo;{status}&rdquo;
              </span>
            </span>
            <span
              aria-hidden
              className="flex-shrink-0"
              style={{ width: 2, height: 2, background: '#d9d9d9', border: '1px solid var(--color-border-hover)' }}
            />
          </span>
        ))}
      </motion.div>
    </div>
  )
}

// Shared member card (Figma 356:3503 / 432:8008) — used by SquadDetailsSheet's Members
// section and HomeClient's read-only squad details sheet (Figma 470:5082). Same card
// exactly, just fed from different data-fetch paths per call site.
export function UserCard({
  profile, msgCount, loading, isOnline, isCreator, vinyl, onTap,
}: {
  profile: MiniMember; msgCount: number; loading: boolean; isOnline: boolean
  isCreator?: boolean
  vinyl?: { imageUrl: string | null; title: string | null } | null
  onTap?: () => void
}) {
  const spriteInfo = spriteInfoFor(profile.avatar_class ?? null)
  const initial    = profile.username[0]?.toUpperCase() ?? '?'
  const classLabel = profile.avatar_class ? (CLASS_LABELS[profile.avatar_class] ?? profile.avatar_class) : 'Unknown'

  return (
    <div
      className="flex flex-col flex-shrink-0 bg-black border border-[var(--color-border-hover)] rounded-[var(--x3,8px)] overflow-hidden active:opacity-70 transition-opacity"
      style={{ width: 180, gap: 12, paddingBottom: profile.status ? 0 : 16, cursor: onTap ? 'pointer' : undefined }}
      onClick={onTap}
    >
      {/* Background header + avatar */}
      <div
        className="relative flex flex-col items-start justify-end flex-shrink-0 w-full overflow-hidden rounded-tl-[7px] rounded-tr-[7px]"
        style={{ height: 108, padding: 12 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed cover fill, same pattern as ProfileHeroBackground/ManageUserProfile's hero */}
        <img
          src={supabaseImageLoader({ src: profile.background_url ?? '/img/default_image.png', width: 360, quality: 75 })}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />
        <div
          className="absolute inset-0 pointer-events-none rounded-tl-[7px] rounded-tr-[7px]"
          style={{ background: 'var(--gradient-image-overlay)' }}
        />
        <div className="relative flex-shrink-0">
          <UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size={32} />
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
          )}
        </div>
      </div>

      {/* Name + class/admin/sprite row + vinyl pill */}
      <div className="flex flex-col w-full flex-shrink-0" style={{ paddingLeft: 12, paddingRight: 12, gap: 8 }}>
        <p
          className="font-body font-bold text-primary truncate leading-none w-full"
          style={{ fontSize: 16, fontVariationSettings: '"opsz" 14' }}
        >
          {profile.username}
        </p>

        <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>
          {isCreator && (
            <Crown style={{ width: 12, height: 12, color: 'var(--color-coins)', flexShrink: 0 }} aria-hidden="true" />
          )}
          <div className="flex items-center justify-center overflow-hidden flex-shrink-0" style={{ width: 12, height: 12 }}>
            {spriteInfo ? (
              <PixelSprite spriteId={spriteInfo.id} nativePx={spriteInfo.nativePx} scale={0.5625} animate />
            ) : (
              <span className="font-pixel text-[6px] text-purple">{initial}</span>
            )}
          </div>
          <p className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
            {loading ? '...' : `${classLabel} · ${msgCount.toLocaleString()} msg.`}
          </p>
        </div>

        {vinyl && (vinyl.imageUrl || vinyl.title) && (
          <VinylPill imageUrl={vinyl.imageUrl} title={vinyl.title} />
        )}
      </div>

      {/* Status ticker — marginTop: auto docks it to the card's true bottom edge even when
          this card is stretched taller to match a taller sibling in the row (e.g. one with
          a vinyl pill); without it the ticker would sit right after the content block and
          leave the stretched slack below itself instead of above. No status → no ticker at
          all, matching Figma's shorter no-status cards (e.g. 432:8008). */}
      {profile.status && (
        <div style={{ marginTop: 'auto' }}>
          <StatusTicker status={profile.status} />
        </div>
      )}
    </div>
  )
}
