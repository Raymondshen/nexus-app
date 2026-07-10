'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Upload } from 'pixelarticons/react/Upload'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { InputField } from '@/shared/components/ui/InputField'
import { Button } from '@/shared/components/ui/Button'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import { getXPInCurrentLevel, getXPForCurrentLevel } from '@/shared/utils/xp'

// Figma 480:6156 "Manage Squad Profile" — the crew equivalent of ManageUserProfile
// (/profile/manage). Replaces the old SquadDetailsEditSheet bottom sheet with a
// full-screen slide-in page. Rendered as an overlay by ChatInput (not a route) so
// it can reuse ChatInput's crew crop-upload modals + rename action, keeping the
// chat header's crew image/name/background preview live as edits happen.
//
// z-[68]: above the chat (ChatInput root is z-[65]) but below the crew crop-upload
// modals (z-[70]/z-[80]) that this page's Upload buttons trigger, so cropping still
// renders on top.

interface ManageSquadProfileProps {
  crewName:                string
  crewImageUrl:            string | null
  crewBackgroundImageUrl:  string | null
  crewLevel:               number
  memberCount:             number
  crewXP:                  number
  xpProgress:              number
  totalMessages:           number
  onUploadPhoto:           () => void
  onUploadBackground:      () => void
  /** Persists the rename; returns the action result so this page can surface an error. */
  onSave:                  (newName: string) => Promise<{ error?: string } | void>
  onClose:                 () => void
}

export function ManageSquadProfile({
  crewName, crewImageUrl, crewBackgroundImageUrl, crewLevel, memberCount,
  crewXP, xpProgress, totalMessages,
  onUploadPhoto, onUploadBackground, onSave, onClose,
}: ManageSquadProfileProps) {
  const [nameValue, setNameValue] = useState(crewName)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const trimmedName = nameValue.trim()

  // Keep the OS/browser back gesture on the chat instead of exiting to home. The
  // chat page uses SlidePage `nativeSwipe`, and it keeps /home as the history entry
  // beneath /chat, so a back gesture would otherwise pop straight to home while this
  // overlay is up. Push a history entry when the page opens; a back gesture pops
  // THAT entry, which we intercept (popstate) to close the page and stay on the chat.
  // The back button and a successful save go through the same pop so it never lingers.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  const closingRef  = useRef(false)

  useEffect(() => {
    window.history.pushState({ nexusManageSquad: true }, '')
    function onPopState() {
      closingRef.current = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function requestClose() {
    if (closingRef.current) return
    closingRef.current = true
    window.history.back()   // pops our pushed entry → popstate → onClose (stays on the chat)
  }

  async function handleSave() {
    if (saving) return
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 30) {
      setSaveError('Name must be 2–30 characters')
      return
    }
    setSaving(true)
    setSaveError(null)
    const result = await onSave(trimmedName)
    setSaving(false)
    if (result && 'error' in result && result.error) { setSaveError(result.error); return }
    requestClose()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[68] bg-black flex flex-col"
      style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
    >
      <PageHeader title="Manage Squad Profile" onBack={requestClose} />

      <div className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col">

        {/* ── Hero (240px) — crew image/name/level + XP bar ── */}
        <div
          className="relative flex flex-col justify-between overflow-hidden flex-shrink-0 w-full"
          style={{ height: 240, padding: 16 }}
        >
          {crewBackgroundImageUrl ? (
            <div className="absolute inset-0 pointer-events-none">
              <Image
                src={crewBackgroundImageUrl}
                alt=""
                fill
                sizes="(max-width: 480px) 100vw, 480px"
                className="object-cover"
                loader={supabaseImageLoader}
              />
            </div>
          ) : (
            <div className="absolute inset-0 bg-[var(--color-surface)]" />
          )}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.604) 33%, rgba(0,0,0,0.6) 66%, rgba(0,0,0,0.8) 100%)' }}
          />

          <div className="relative flex items-center" style={{ gap: 8 }}>
            <GroupAvatar imageUrl={crewImageUrl} name={trimmedName || crewName} size={40} />
            <div className="flex flex-col min-w-0" style={{ gap: 4 }}>
              <p
                className="font-body font-bold leading-none truncate uppercase"
                style={{ fontSize: 'var(--text-md)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
              >
                {trimmedName || crewName}
              </p>
              <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                Lv.{crewLevel} · {memberCount} {memberCount === 1 ? 'member' : 'members'}
              </p>
            </div>
          </div>

          <div className="relative flex flex-col w-full" style={{ gap: 8 }}>
            <p className="leading-[0] text-[0px] font-silkscreen w-full">
              <span className="leading-none text-tertiary" style={{ fontSize: 'var(--text-mini)' }}>
                {`${getXPInCurrentLevel(crewXP)} / ${getXPForCurrentLevel(crewXP)}XP`}
              </span>
              {totalMessages > 0 && (
                <>
                  <span className="leading-none text-tertiary" style={{ fontSize: 'var(--text-mini)' }}>{` · `}</span>
                  <span className="leading-none text-secondary" style={{ fontSize: 'var(--text-mini)' }}>
                    {totalMessages.toLocaleString()} total Squad msg.
                  </span>
                </>
              )}
            </p>
            <div className="bg-[var(--color-surface)] overflow-hidden w-full" style={{ height: 4 }}>
              <div
                className="h-full bg-purple"
                style={{ width: `${xpProgress}%`, transition: 'width 0.5s ease-out' }}
              />
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-col w-full" style={{ gap: 20, paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16 }}>

          {/* Group Profile Photo / Background Image upload buttons */}
          <div className="flex w-full" style={{ gap: 16 }}>
            <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
              <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                Group Profile Photo
              </p>
              <button
                type="button"
                onClick={onUploadPhoto}
                disabled={saving}
                className="flex items-center justify-center w-full h-12 border border-[var(--color-purple)] active:opacity-70 transition-opacity disabled:opacity-40"
                style={{ gap: 8 }}
              >
                <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                <span className="font-silkscreen leading-none pb-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}>
                  Upload
                </span>
              </button>
            </div>

            <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
              <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                Background Image
              </p>
              <button
                type="button"
                onClick={onUploadBackground}
                disabled={saving}
                className="flex items-center justify-center w-full h-12 border border-[var(--color-purple)] active:opacity-70 transition-opacity disabled:opacity-40"
                style={{ gap: 8 }}
              >
                <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                <span className="font-silkscreen leading-none pb-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}>
                  Upload
                </span>
              </button>
            </div>
          </div>

          <InputField
            label="Squad Name"
            value={nameValue}
            onChange={(v) => { setNameValue(v.slice(0, 30)); setSaveError(null) }}
            placeholder={crewName}
            maxLength={30}
            autoComplete="off"
          />

          {saveError && (
            <p className="font-pixel text-[8px] text-[#ef4444]">{saveError}</p>
          )}
        </div>
      </div>

      {/* ── Save Changes — pinned footer (sibling of the scroll area) ── */}
      <div className="flex flex-col w-full flex-shrink-0" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}>
        <Button
          shadow
          onClick={handleSave}
          disabled={saving || !trimmedName || trimmedName.length < 2}
          loading={saving}
          className="w-full"
        >
          Save Changes
        </Button>
      </div>
    </motion.div>
  )
}
