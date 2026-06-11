'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { XP_PER_LEVEL } from '@/lib/game/xp'

type MiniMember = { id: string; username: string; avatar_url: string | null }

interface SquadDetailsSheetProps {
  crewName:      string
  memberCount:   number
  crewImageUrl:  string | null
  members:       MiniMember[]
  onlineUserIds: Set<string>
  crewXP:        number
  crewLevel:     number
  xpProgress:    number
  totalMessages: number
  onUploadPhoto: () => void
  onSave:        (newName: string) => Promise<void>
  onClose:       () => void
}

export function SquadDetailsSheet({
  crewName,
  memberCount,
  crewImageUrl,
  members,
  onlineUserIds,
  crewXP,
  crewLevel,
  xpProgress,
  totalMessages,
  onUploadPhoto,
  onSave,
  onClose,
}: SquadDetailsSheetProps) {
  const [nameValue, setNameValue] = useState(crewName)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => { setNameValue(crewName) }, [crewName])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try { await onSave(nameValue) }
    finally { setSaving(false) }
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[62] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[63] max-w-[480px] mx-auto bg-black border-t border-border-hover flex flex-col gap-[var(--space-7)] px-[var(--space-5)] pt-[var(--space-7)] overflow-hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <p
          className="font-body font-bold text-primary leading-none"
          style={{ fontSize: 'var(--text-lg)', fontVariationSettings: '"opsz" 14' }}
        >
          Squad Details
        </p>

        {/* Read-only preview */}
        <div className="flex flex-col gap-14">
          {/* Crew image + name + member count */}
          <div className="flex items-center gap-2">
            <div className="relative flex-shrink-0 w-8 h-8 overflow-hidden">
              {crewImageUrl ? (
                <Image
                  src={crewImageUrl}
                  alt={crewName}
                  fill
                  sizes="32px"
                  className="object-cover"
                  unoptimized={isSupabaseStorage(crewImageUrl)}
                />
              ) : (
                <div className="w-full h-full bg-purple" />
              )}
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <p
                className="font-silkscreen text-purple leading-none truncate"
                style={{ fontSize: 'var(--text-md)' }}
              >
                {crewName.toUpperCase()}
              </p>
              <p
                className="font-silkscreen text-tertiary leading-none"
                style={{ fontSize: 'var(--text-mini)' }}
              >
                {memberCount} {memberCount === 1 ? 'member' : 'members'}
              </p>
            </div>
          </div>

          {/* Avatar list + XP bar */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {members.slice(0, 8).map((m) => {
                const url     = m.avatar_url
                const initial = m.username[0]?.toUpperCase() ?? '?'
                const online  = onlineUserIds.has(m.id)
                return (
                  <div key={m.id} className="relative flex-shrink-0">
                    <div className="w-6 h-6 overflow-hidden bg-surface flex items-center justify-center">
                      {url ? (
                        <div className="relative w-full h-full">
                          <Image
                            src={resolveAvatarUrl(url, 24)}
                            alt={m.username}
                            fill
                            sizes="24px"
                            className="object-cover"
                            unoptimized={isSupabaseStorage(url)}
                          />
                        </div>
                      ) : (
                        <span className="font-pixel text-[8px] text-purple">{initial}</span>
                      )}
                    </div>
                    {online && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex flex-col gap-2 w-full">
              <p className="w-full leading-[0] text-[0px] font-silkscreen">
                <span className="text-[8px] leading-none text-primary">Level {crewLevel}</span>
                <span className="text-[8px] leading-none text-tertiary">
                  {` · ${crewXP % XP_PER_LEVEL} / ${XP_PER_LEVEL}XP`}
                </span>
                {totalMessages > 0 && (
                  <span className="text-[8px] leading-none text-tertiary">
                    {` · ${totalMessages.toLocaleString()} total msg.`}
                  </span>
                )}
              </p>
              <div className="bg-surface h-1 overflow-hidden w-full relative">
                <div
                  className="absolute left-0 top-0 h-full bg-purple"
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Editable fields */}
        <div className="flex flex-col gap-[var(--space-5)]">
          {/* Squad Profile Picture */}
          <div className="flex flex-col gap-2">
            <p
              className="font-body font-medium text-primary tracking-[0.2px] leading-normal"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            >
              Squad Profile Picture
            </p>
            <div className="flex items-center gap-[var(--space-5)]">
              <div className="relative flex-shrink-0 w-12 h-12 overflow-hidden">
                {crewImageUrl ? (
                  <Image
                    src={crewImageUrl}
                    alt={crewName}
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized={isSupabaseStorage(crewImageUrl)}
                  />
                ) : (
                  <div className="w-full h-full bg-purple" />
                )}
              </div>
              <button
                onClick={onUploadPhoto}
                className="flex-1 h-[var(--space-13)] border border-purple flex items-center justify-center overflow-hidden transition-opacity active:opacity-70"
              >
                <span
                  className="font-silkscreen leading-none whitespace-nowrap text-purple"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  upload photo
                </span>
              </button>
            </div>
          </div>

          {/* Squad Name */}
          <div className="flex flex-col gap-2">
            <p
              className="font-body font-medium text-primary tracking-[0.2px] leading-normal"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            >
              Squad Name
            </p>
            <div
              className="bg-black border h-[var(--space-13)] flex items-center overflow-hidden px-3 w-full"
              style={{ borderColor: 'var(--color-border-hover)' }}
            >
              <input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value.slice(0, 30))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                maxLength={30}
                placeholder={crewName}
                className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-tertiary focus:outline-none leading-normal"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-[var(--space-5)]">
          <button
            onClick={handleSave}
            disabled={saving || !nameValue.trim() || nameValue.trim().length < 2}
            className="w-full h-[var(--space-13)] bg-purple flex items-center justify-center overflow-hidden disabled:opacity-50 transition-opacity active:opacity-80"
          >
            <span
              className="font-silkscreen leading-none whitespace-nowrap text-primary"
              style={{ fontSize: 'var(--text-sm)' }}
            >
              {saving ? '...' : 'Save Changes'}
            </span>
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-full h-[var(--space-13)] border flex items-center justify-center overflow-hidden disabled:opacity-50 transition-opacity active:opacity-70"
            style={{ borderColor: '#ef4444' }}
          >
            <span
              className="font-silkscreen leading-none whitespace-nowrap"
              style={{ fontSize: 'var(--text-sm)', color: '#ef4444' }}
            >
              Cancel
            </span>
          </button>
        </div>
      </motion.div>
    </>
  )
}
