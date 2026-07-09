'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Plus } from 'pixelarticons/react/Plus'
import { validateUsernameFormat } from '@/shared/utils/username'
import { formatShortDate } from '@/shared/utils/date'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { signOut } from '@/shared/supabase/auth'
import {
  revalidateProfileAction,
  resetAvatarAction,
  resetBackgroundAction,
  updateProfileDetailsAction,
  requestAccountDeletionAction,
  cancelAccountDeletionAction,
} from '@/app/(app)/profile/actions'
import { createAnnouncementAction } from '@/app/(app)/home/actions'
import { AvatarUploadModal } from '@/shared/components/overlays/AvatarUploadModal'
import { BackgroundUploadModal } from '@/shared/components/overlays/BackgroundUploadModal'
import { Button } from '@/shared/components/ui/Button'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { Message } from 'pixelarticons/react/Message'

export interface SettingsClientProps {
  userId:          string
  userEmail:       string
  initialUsername: string
  initialStatus:   string | null
  avatarUrl:       string | null
  backgroundUrl:   string | null
  isDev:           boolean
  isGuest:         boolean
  customAvatar:    boolean
  memberSinceYear: string
  totalMessages:   number
  groupChats:      number
  pendingDeleteAt: string | null
  initialCoins:    number
}

// ─── Status ticker preview ────────────────────────────────────────────────────

function StatusTicker({ status }: { status: string }) {
  return (
    <TickerBanner
      text={status}
      icon={<Message style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />}
      quoted
    />
  )
}

// ─── Edit Profile bottom sheet ────────────────────────────────────────────────

function EditProfileSheet({
  isOpen,
  onClose,
  onSave,
  onAvatarChange,
  initialDisplayName,
  initialStatus,
  avatarUrl,
  backgroundUrl,
  onBgUpload,
  userId,
  isDev,
  memberSinceYear,
  groupChats,
  totalMessages,
  userEmail,
  isGuest,
  deletePending,
  localDeleteAt,
  loggingOut,
  onLogout,
  cancellingDelete,
  onCancelDeletion,
  onOpenDeleteSheet,
}: {
  isOpen:             boolean
  onClose:            () => void
  onSave:             (displayName: string, status: string) => void
  onAvatarChange:     (url: string) => void
  initialDisplayName: string
  initialStatus:      string
  avatarUrl:          string | null
  backgroundUrl:      string | null
  onBgUpload:         () => void
  userId:             string
  isDev:              boolean
  memberSinceYear:    string
  groupChats:         number
  totalMessages:      number
  userEmail:          string
  isGuest:            boolean
  deletePending:      boolean
  localDeleteAt:      string | null
  loggingOut:         boolean
  onLogout:           () => void
  cancellingDelete:   boolean
  onCancelDeletion:   () => void
  onOpenDeleteSheet:  () => void
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [status,      setStatus]      = useState(initialStatus)
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setDisplayName(initialDisplayName)
      setStatus(initialStatus)
      setSaveError(null)
    }
  }, [isOpen, initialDisplayName, initialStatus])

  async function handleSave() {
    const trimmed = displayName.trim()
    const formatError = validateUsernameFormat(trimmed)
    if (formatError) { setSaveError(formatError); return }
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await updateProfileDetailsAction(trimmed, status.trim())
      if (result.error === 'taken') { setSaveError('Name already taken'); return }
      if (result.error) { setSaveError(result.error); return }
      onSave(trimmed, status.trim())
      onClose()
    } catch {
      setSaveError('Failed to save — try again')
    } finally {
      setSaving(false)
    }
  }

  const msgFormatted = totalMessages.toLocaleString()
  const previewName  = displayName.trim() || initialDisplayName

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[48] flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            <div className="absolute inset-0 bg-black/60" />
            <motion.div
              className="relative w-full max-w-[480px] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col overflow-hidden"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 1 }}
              onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
              style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom))', maxHeight: '90vh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Profile hero preview */}
              <div
                className="relative flex flex-col items-end justify-between overflow-hidden shrink-0 w-full"
                style={{ height: 280, padding: 16 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={backgroundUrl ?? '/img/default_image.png'}
                  alt=""
                  aria-hidden
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 48.668%, rgba(0,0,0,0.8) 82.216%, rgb(0,0,0) 100%)' }}
                />

                {/* Background edit */}
                <button
                  onClick={onBgUpload}
                  className="relative bg-surface border border-primary flex items-center overflow-hidden p-2"
                  style={{ boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)' }}
                  aria-label="Edit cover"
                >
                  <MagicEdit style={{ width: 12, height: 12, color: 'var(--color-primary)' }} />
                </button>

                {/* Avatar + details */}
                <div className="relative flex items-center w-full" style={{ gap: 16 }}>
                  <div className="relative flex-shrink-0" style={{ width: 56, height: 56 }}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="relative w-full h-full overflow-hidden"
                      style={{ borderRadius: '50%' }}
                      aria-label="Change photo"
                    >
                      <UserAvatar avatarUrl={avatarUrl} username={previewName} size={56} bg="primary" />
                    </button>
                    <div
                      className="absolute bg-surface border border-primary flex items-center overflow-hidden p-2 pointer-events-none"
                      style={{ top: -8, left: 36, boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)' }}
                      aria-hidden="true"
                    >
                      <MagicEdit style={{ width: 12, height: 12, color: 'var(--color-primary)' }} />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-center leading-none" style={{ gap: 4 }}>
                    {memberSinceYear && (
                      <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                        Member Since {memberSinceYear}
                      </p>
                    )}
                    <p className="font-body font-bold truncate" style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
                      {previewName}
                    </p>
                    <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                      {groupChats} group chat{groupChats !== 1 ? 's' : ''} · {msgFormatted} msg
                    </p>
                  </div>
                </div>
              </div>

              <StatusTicker status={status.trim() || 'Whats the mood today...'} />

              <div className="flex flex-col items-start w-full" style={{ gap: 24, paddingTop: 16, paddingLeft: 16, paddingRight: 16 }}>
                <div className="flex flex-col items-start w-full" style={{ gap: 16 }}>

                  <div className="flex flex-col w-full" style={{ gap: 8 }}>
                    <p className="font-body font-medium text-primary tracking-[0.2px] leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                      Display Name
                    </p>
                    <div className="bg-black border h-[48px] flex items-center overflow-hidden px-3 w-full" style={{ borderColor: 'var(--color-border-hover)' }}>
                      <input
                        value={displayName}
                        onChange={(e) => { setDisplayName(e.target.value); setSaveError(null) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                        minLength={3}
                        maxLength={20}
                        placeholder="your display name"
                        className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-tertiary focus:outline-none leading-normal"
                        style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col w-full" style={{ gap: 8 }}>
                    <p className="font-body font-medium text-primary tracking-[0.2px] leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                      Status
                    </p>
                    <div className="bg-black border h-[48px] flex items-center overflow-hidden px-3 w-full" style={{ borderColor: 'var(--color-border-hover)' }}>
                      <input
                        value={status}
                        onChange={(e) => setStatus(e.target.value.slice(0, 100))}
                        placeholder="Whats the mood today..."
                        className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-tertiary focus:outline-none leading-normal"
                        style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                      />
                    </div>
                  </div>

                </div>

                {saveError && (
                  <p className="font-pixel text-[8px] text-[#ef4444] -mt-4">{saveError}</p>
                )}

                <Button
                  onClick={handleSave}
                  disabled={saving || !displayName.trim() || displayName.trim().length < 3}
                  loading={saving}
                  className="w-full"
                >
                  Save Changes
                </Button>

                {/* Account section (folded in from the former Account Details sheet) */}
                <div className="flex flex-col gap-[var(--space-2)] w-full border-t border-border" style={{ paddingTop: 24 }}>
                  <p className="font-body font-bold text-primary leading-none w-full" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
                    Account
                  </p>
                  <p className="font-body font-normal leading-normal w-full" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}>
                    {'Signed in with '}
                    <span style={{ color: 'var(--color-primary)' }}>{userEmail}</span>
                  </p>
                </div>

                {deletePending && localDeleteAt && (
                  <div
                    className="flex flex-col gap-[var(--space-2)] p-[var(--space-4)] w-full"
                    style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)' }}
                  >
                    <p className="font-silkscreen leading-relaxed" style={{ fontSize: 'var(--text-mini)', color: '#ef4444' }}>
                      Account deletion scheduled
                    </p>
                    <p className="font-body font-normal leading-normal tracking-[0.2px]" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}>
                      Permanent deletion on{' '}
                      <span style={{ color: 'var(--color-primary)' }}>
                        {formatShortDate(localDeleteAt)}
                      </span>
                      . All data will be erased.
                    </p>
                    <button
                      onClick={onCancelDeletion}
                      disabled={cancellingDelete}
                      className="self-start font-silkscreen leading-none disabled:opacity-50 transition-opacity hover:opacity-70"
                      style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}
                    >
                      {cancellingDelete ? '...' : 'Cancel deletion'}
                    </button>
                  </div>
                )}

                <div className="flex flex-col w-full" style={{ gap: 'var(--space-5)' }}>
                  <button
                    onClick={onLogout}
                    disabled={loggingOut}
                    className="w-full h-12 flex items-center justify-center overflow-hidden disabled:opacity-50 transition-opacity"
                    style={{ background: '#ef4444' }}
                  >
                    <span className="font-silkscreen leading-none whitespace-nowrap text-primary" style={{ fontSize: 'var(--text-xs)' }}>
                      {loggingOut ? '...' : 'Log out'}
                    </span>
                  </button>

                  {!isGuest && !deletePending && (
                    <button
                      onClick={onOpenDeleteSheet}
                      className="w-full h-12 border border-[#ef4444] flex items-center justify-center overflow-hidden transition-colors hover:bg-[#ef4444]/8"
                    >
                      <span className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xs)', color: '#ef4444' }}>
                        Delete account
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
            style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setPendingFile(f)
              e.target.value = ''
            }}
          />
          <AvatarUploadModal
            file={pendingFile}
            userId={userId}
            isDev={isDev}
            onClose={() => setPendingFile(null)}
            onSuccess={(url) => {
              onAvatarChange(url)
              setPendingFile(null)
            }}
          />
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Delete Account confirmation sheet ───────────────────────────────────────

function DeleteAccountSheet({
  isOpen,
  onClose,
  onConfirm,
  confirming,
}: {
  isOpen:     boolean
  onClose:    () => void
  onConfirm:  () => void
  confirming: boolean
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[48] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[50] max-w-[480px] mx-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div
              className="bg-surface border-t overflow-hidden flex flex-col gap-[var(--space-7)]"
              style={{
                borderColor:   '#ef4444',
                padding:       'var(--space-7) var(--space-5)',
                paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))',
              }}
            >
              <div className="flex flex-col gap-[var(--space-3)]">
                <p className="font-body font-bold leading-none" style={{ fontSize: 'var(--text-lg)', color: '#ef4444', fontVariationSettings: '"opsz" 14' }}>
                  Delete Account
                </p>
                <p className="font-body font-normal leading-relaxed tracking-[0.2px]" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}>
                  Your account will be permanently deleted in <span style={{ color: 'var(--color-primary)' }}>7 days</span>. All your messages, XP, crew memberships, friends, and profile data will be erased and cannot be recovered.
                </p>
                <p className="font-body font-normal leading-relaxed tracking-[0.2px]" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}>
                  You can cancel this at any time before the grace period ends by logging back in.
                </p>
              </div>

              <div className="flex flex-col gap-[var(--space-5)]">
                <button
                  onClick={onConfirm}
                  disabled={confirming}
                  className="w-full h-12 border border-[#ef4444] flex items-center justify-center disabled:opacity-50 overflow-hidden transition-colors hover:bg-[#ef4444]/10"
                >
                  <span className="font-pixel leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-mini)', color: '#ef4444' }}>
                    {confirming ? '...' : 'DELETE MY ACCOUNT'}
                  </span>
                </button>
                <button
                  onClick={onClose}
                  disabled={confirming}
                  className="w-full h-12 border border-border flex items-center justify-center disabled:opacity-50 overflow-hidden transition-colors hover:bg-surface"
                >
                  <span className="font-pixel leading-none whitespace-nowrap text-secondary" style={{ fontSize: 'var(--text-mini)' }}>
                    CANCEL
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── BackButton — must render inside SlidePage context ───────────────────────

function SettingsBackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex items-center justify-center border border-border flex-shrink-0"
      style={{ padding: 'var(--x3)' }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
    </button>
  )
}

// ─── Developer section (folded in from the former standalone /profile/developer page) ─

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        width: 48,
        height: 28,
        borderRadius: 40,
        background: enabled ? 'var(--color-purple)' : 'var(--color-border)',
      }}
      aria-checked={enabled}
      role="switch"
    >
      <motion.span
        className="absolute top-[4px] rounded-full bg-white pointer-events-none"
        style={{ width: 20, height: 20 }}
        animate={{ left: enabled ? 24 : 4 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </button>
  )
}

function DevNavRow({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center w-full text-left" style={{ gap: 'var(--space-3)' }}>
      <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
        <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
          {title}
        </p>
        <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
          {description}
        </p>
      </div>
      <ChevronRight style={{ width: 20, height: 20, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
    </button>
  )
}

function DevToggleRow({ title, description, enabled, onChange }: { title: string; description: string; enabled: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center w-full" style={{ gap: 'var(--space-3)' }}>
      <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
        <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
          {title}
        </p>
        <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
          {description}
        </p>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onChange} />
    </div>
  )
}

function DeveloperSection({ initialCoins }: { initialCoins: number }) {
  const router = useRouter()

  const [showPush,      setShowPush]      = useState(false)
  const [infiniteCoins, setInfiniteCoins] = useState(false)
  const [pollFeature,   setPollFeature]   = useState(false)
  const [eventsFeature, setEventsFeature] = useState(false)
  const [friendshipXP,  setFriendshipXP]  = useState(false)
  const [combatSystem,  setCombatSystem]  = useState(false)
  const [newTitle,     setNewTitle]     = useState('')
  const [newText,      setNewText]      = useState('')
  const [newImageUrl,  setNewImageUrl]  = useState('')
  const [addingBanner, setAddingBanner] = useState(false)
  const [bannerError,  setBannerError]  = useState<string | null>(null)
  const [addedSuccess, setAddedSuccess] = useState(false)

  useEffect(() => {
    setShowPush(localStorage.getItem('nexus_push_diag') === '1')
    setInfiniteCoins(localStorage.getItem('nexus_infinite_coins') === '1')
    setPollFeature(localStorage.getItem('nexus_poll_feature') === '1')
    setEventsFeature(localStorage.getItem('nexus_events_enabled') === '1')
    setFriendshipXP(localStorage.getItem('nexus_friendship_xp') === '1')
    setCombatSystem(localStorage.getItem('nexus_combat_system') === '1')
  }, [])

  function toggleShowPush() {
    const next = !showPush
    setShowPush(next)
    if (next) localStorage.setItem('nexus_push_diag', '1')
    else localStorage.removeItem('nexus_push_diag')
    window.dispatchEvent(new CustomEvent('nexus-push-diag-change', { detail: { on: next } }))
  }

  function toggleInfiniteCoins() {
    const next = !infiniteCoins
    setInfiniteCoins(next)
    if (next) localStorage.setItem('nexus_infinite_coins', '1')
    else localStorage.removeItem('nexus_infinite_coins')
    window.dispatchEvent(new CustomEvent('nexus-infinite-coins-change', { detail: { on: next } }))
  }

  function togglePollFeature() {
    const next = !pollFeature
    setPollFeature(next)
    if (next) localStorage.setItem('nexus_poll_feature', '1')
    else localStorage.removeItem('nexus_poll_feature')
    window.dispatchEvent(new CustomEvent('nexus-poll-feature-change', { detail: { on: next } }))
  }

  function toggleEventsFeature() {
    const next = !eventsFeature
    setEventsFeature(next)
    if (next) localStorage.setItem('nexus_events_enabled', '1')
    else localStorage.removeItem('nexus_events_enabled')
    window.dispatchEvent(new CustomEvent('nexus-events-feature-change', { detail: { on: next } }))
  }

  function toggleFriendshipXP() {
    const next = !friendshipXP
    setFriendshipXP(next)
    if (next) localStorage.setItem('nexus_friendship_xp', '1')
    else localStorage.removeItem('nexus_friendship_xp')
    window.dispatchEvent(new CustomEvent('nexus-friendship-xp-change', { detail: { on: next } }))
  }

  function toggleCombatSystem() {
    const next = !combatSystem
    setCombatSystem(next)
    if (next) localStorage.setItem('nexus_combat_system', '1')
    else localStorage.removeItem('nexus_combat_system')
    window.dispatchEvent(new CustomEvent('nexus-combat-system-change', { detail: { on: next } }))
  }

  async function handleCreateBanner() {
    if (!newTitle.trim() || !newText.trim() || !newImageUrl.trim() || addingBanner) return
    setAddingBanner(true)
    setBannerError(null)
    const result = await createAnnouncementAction(newTitle.trim(), newText.trim(), newImageUrl.trim())
    setAddingBanner(false)
    if (result.error) { setBannerError(result.error); return }
    setNewTitle('')
    setNewText('')
    setNewImageUrl('')
    setAddedSuccess(true)
    setTimeout(() => setAddedSuccess(false), 2000)
  }

  return (
    <div className="flex flex-col w-full" style={{ gap: 'var(--space-7)' }}>
      <p className="font-silkscreen leading-normal tracking-[0.2px] uppercase" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-purple)' }}>
        Developer
      </p>

      {/* Announcements */}
      <div className="flex flex-col w-full" style={{ gap: 'var(--space-5)' }}>
        <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
          <p className="font-body font-medium text-primary tracking-[0.2px] leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
            Announcements
          </p>

          <div
            className="border flex h-[48px] items-center overflow-hidden w-full"
            style={{ borderColor: 'var(--color-border)', paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)' }}
          >
            <input
              value={newTitle}
              onChange={(e) => { setNewTitle(e.target.value.slice(0, 200)); setBannerError(null) }}
              placeholder="Title, e.g. Text Effects"
              maxLength={200}
              className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none leading-normal"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            />
          </div>

          <div
            className="border flex h-[48px] items-center overflow-hidden w-full"
            style={{ borderColor: 'var(--color-border)', paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)' }}
          >
            <input
              value={newImageUrl}
              onChange={(e) => { setNewImageUrl(e.target.value.slice(0, 300)); setBannerError(null) }}
              placeholder="Image path, e.g. /img/announcements/foo.svg"
              maxLength={300}
              className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none leading-normal"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            />
          </div>

          <div
            className="border flex h-[48px] items-center overflow-hidden w-full"
            style={{ borderColor: 'var(--color-border)', paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)' }}
          >
            <input
              value={newText}
              onChange={(e) => { setNewText(e.target.value.slice(0, 500)); setBannerError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBanner() }}
              placeholder="Body text..."
              maxLength={500}
              className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none leading-normal"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            />
          </div>

          {bannerError && (
            <p className="font-pixel leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
              {bannerError}
            </p>
          )}

          <button
            onClick={handleCreateBanner}
            disabled={!newTitle.trim() || !newText.trim() || !newImageUrl.trim() || addingBanner}
            className="flex items-center justify-center overflow-hidden w-full disabled:opacity-40"
            style={{
              background: addedSuccess ? '#22c55e' : 'var(--color-purple)',
              gap:          'var(--space-3)',
              paddingLeft:  'var(--space-6)',
              paddingRight: 'var(--space-6)',
              paddingTop:   'var(--space-5)',
              paddingBottom: 'var(--space-5)',
              boxShadow: addedSuccess
                ? '4px 4px 0px 0px rgba(34,197,94,0.5)'
                : '4px 4px 0px 0px rgba(168,85,247,0.5)',
              transition: 'background 0.2s, box-shadow 0.2s',
            }}
          >
            <Plus style={{ width: 16, height: 16, color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
            <span className="font-silkscreen text-primary leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xs)' }}>
              {addingBanner ? '...' : addedSuccess ? 'Added!' : 'Add announcement'}
            </span>
          </button>
        </div>

        <DevNavRow
          title="Published Announcements"
          description="View all published announcements"
          onClick={() => router.push('/profile/developer/announcements')}
        />
      </div>

      {/* Debug */}
      <div className="flex flex-col w-full" style={{ gap: 'var(--space-5)' }}>
        <p className="font-silkscreen leading-normal tracking-[0.2px] uppercase" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-purple)' }}>
          Debug
        </p>

        <DevToggleRow
          title="Notification Subscription"
          description="Test push notification."
          enabled={showPush}
          onChange={toggleShowPush}
        />
      </div>

      {/* Features */}
      <div className="flex flex-col w-full" style={{ gap: 'var(--space-5)' }}>
        <p className="font-silkscreen leading-normal tracking-[0.2px] uppercase" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-purple)' }}>
          Features
        </p>

        <DevToggleRow
          title="Infinite Coins"
          description={`Balance : ${initialCoins.toLocaleString()} coins`}
          enabled={infiniteCoins}
          onChange={toggleInfiniteCoins}
        />

        <DevToggleRow
          title="Poll Feature"
          description="Show poll creation button in chat input"
          enabled={pollFeature}
          onChange={togglePollFeature}
        />

        <DevToggleRow
          title="Events Feature"
          description="Enable group event creation and calendar in chat"
          enabled={eventsFeature}
          onChange={toggleEventsFeature}
        />

        <DevToggleRow
          title="Friendship XP System"
          description="DM and @mention XP, bond progress bar, and toast"
          enabled={friendshipXP}
          onChange={toggleFriendshipXP}
        />

        <DevToggleRow
          title="Combat System"
          description="Show raid HUD, boss damage floats, and ability controls"
          enabled={combatSystem}
          onChange={toggleCombatSystem}
        />
      </div>
    </div>
  )
}

// ─── SettingsClient ───────────────────────────────────────────────────────────

export function SettingsClient({
  userId,
  userEmail,
  initialUsername,
  initialStatus,
  avatarUrl,
  backgroundUrl,
  isDev,
  isGuest,
  customAvatar,
  memberSinceYear,
  totalMessages,
  groupChats,
  pendingDeleteAt,
  initialCoins,
}: SettingsClientProps) {
  const router = useRouter()

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const [localAvatarUrl,    setLocalAvatarUrl]    = useState(avatarUrl)
  const [localBackgroundUrl,setLocalBackgroundUrl]= useState(backgroundUrl)
  const [localUsername,     setLocalUsername]     = useState(initialUsername)
  const [localStatus,       setLocalStatus]       = useState(initialStatus ?? '')
  const [pendingBgFile,     setPendingBgFile]     = useState<File | null>(null)
  const bgFileInputRef = useRef<HTMLInputElement>(null)

  // ── Edit profile sheet ────────────────────────────────────────────────────
  const [showEditSheet, setShowEditSheet] = useState(false)

  // ── Logout ────────────────────────────────────────────────────────────────
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try { await signOut(); router.push('/login') }
    catch { setLoggingOut(false) }
  }

  // ── Delete account ────────────────────────────────────────────────────────
  const [showDeleteSheet,  setShowDeleteSheet]  = useState(false)
  const [deletePending,    setDeletePending]    = useState(!!pendingDeleteAt)
  const [localDeleteAt,    setLocalDeleteAt]    = useState(pendingDeleteAt)
  const [deletingAccount,  setDeletingAccount]  = useState(false)
  const [cancellingDelete, setCancellingDelete] = useState(false)

  async function handleDeleteAccount() {
    if (deletingAccount) return
    setDeletingAccount(true)
    try {
      const result = await requestAccountDeletionAction()
      if (!result.error) router.push('/login')
    } finally {
      setDeletingAccount(false)
    }
  }

  async function handleCancelDeletion() {
    if (cancellingDelete) return
    setCancellingDelete(true)
    try {
      const result = await cancelAccountDeletionAction()
      if (!result.error) {
        setDeletePending(false)
        setLocalDeleteAt(null)
      }
    } finally {
      setCancellingDelete(false)
    }
  }

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-3"
        style={{
          paddingTop:    'calc(env(safe-area-inset-top, 0px) + 18px)',
          paddingLeft:   16,
          paddingRight:  16,
          paddingBottom: 16,
          borderBottom:  '1px solid var(--color-border)',
        }}
      >
        <SettingsBackButton />
        <p
          className="font-body font-bold text-primary leading-none"
          style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
        >
          Settings
        </p>
      </div>

      {/* Settings list */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{ padding: '24px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 24px)', gap: 24 }}
      >

        {/* Edit Profile */}
        <button
          onClick={() => setShowEditSheet(true)}
          disabled={isGuest}
          className="w-full flex gap-3 items-center text-left disabled:opacity-50"
          style={{ minHeight: 34 }}
        >
          <MagicEdit style={{ width: 20, height: 20, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
          <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
            <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
              Edit Profile
            </p>
            <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
              Manage your profile.
            </p>
          </div>
          <ChevronRight style={{ width: 20, height: 20, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
        </button>

        {/* Developer section — dev only, inlined from the former /profile/developer page */}
        {isDev && (
          <DeveloperSection initialCoins={initialCoins} />
        )}

      </div>

      {/* Edit Profile sheet (now also hosts the former Account Details content) */}
      <EditProfileSheet
        isOpen={showEditSheet}
        onClose={() => setShowEditSheet(false)}
        onSave={(displayName, status) => {
          setLocalUsername(displayName)
          setLocalStatus(status)
          revalidateProfileAction()
        }}
        onAvatarChange={(url) => setLocalAvatarUrl(url)}
        initialDisplayName={localUsername}
        initialStatus={localStatus}
        avatarUrl={localAvatarUrl}
        backgroundUrl={localBackgroundUrl}
        onBgUpload={() => bgFileInputRef.current?.click()}
        userId={userId}
        isDev={isDev}
        memberSinceYear={memberSinceYear}
        groupChats={groupChats}
        totalMessages={totalMessages}
        userEmail={userEmail}
        isGuest={isGuest}
        deletePending={deletePending}
        localDeleteAt={localDeleteAt}
        loggingOut={loggingOut}
        onLogout={handleLogout}
        cancellingDelete={cancellingDelete}
        onCancelDeletion={handleCancelDeletion}
        onOpenDeleteSheet={() => {
          setShowEditSheet(false)
          setShowDeleteSheet(true)
        }}
      />

      {/* Hidden background file input */}
      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setPendingBgFile(f)
          e.target.value = ''
        }}
      />

      {/* Background upload modal */}
      <BackgroundUploadModal
        file={pendingBgFile}
        userId={userId}
        isDev={isDev}
        onClose={() => setPendingBgFile(null)}
        onSuccess={(url) => {
          setLocalBackgroundUrl(url)
          setPendingBgFile(null)
        }}
      />

      {/* Delete account confirmation */}
      <DeleteAccountSheet
        isOpen={showDeleteSheet}
        onClose={() => setShowDeleteSheet(false)}
        onConfirm={handleDeleteAccount}
        confirming={deletingAccount}
      />

    </SlidePage>
  )
}
