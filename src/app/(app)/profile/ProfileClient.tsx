'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Message } from 'pixelarticons/react/Message'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Bell } from 'pixelarticons/react/Bell'
import { User } from 'pixelarticons/react/User'
import { Terminal } from 'pixelarticons/react/Terminal'
import { SettingsCog } from 'pixelarticons/react/SettingsCog'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/lib/supabase/auth'
import { revalidateProfileAction, resetAvatarAction, resetBackgroundAction, updateProfileDetailsAction, requestAccountDeletionAction, cancelAccountDeletionAction } from './actions'
import { NotifSheet, type NotifPrefs } from '@/components/chat/NotifSheet'
import { AvatarUploadModal } from '@/components/ui/AvatarUploadModal'
import { BackgroundUploadModal } from '@/components/ui/BackgroundUploadModal'
import { Button } from '@/components/ui/Button'
import { MarqueeBanner } from '@/components/ui/MarqueeBanner'
import { NotesGrid } from './notes/NotesGrid'
import type { NotesGridHandle } from './notes/NotesGrid'
import type { PublicNote, BoardSection } from '@/types'

interface ProfileClientProps {
  userId:             string
  userEmail:          string
  initialUsername:    string
  avatarUrl:          string | null
  avatarClass:        string | null
  customAvatar:       boolean
  backgroundUrl:      string | null
  isDev:              boolean
  isGuest:            boolean
  memberSinceYear:    string
  totalMessages:      number
  groupChats:         number
  inviterUsername:    string | null
  initialStatus:      string | null
  pendingDeleteAt:    string | null
  coins:              number
  totalFriendshipXP:  number
  initialNotes:       PublicNote[]
  initialSections:    BoardSection[]
  notesCrews:         Array<{ id: string; name: string }>
}

// ─── Profile status ticker — wraps shared MarqueeBanner ─────────────────────

function ProfileStatusTicker({ status }: { status: string }) {
  return (
    <MarqueeBanner
      text={status}
      icon={<Message style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />}
      quoted
    />
  )
}

// ─── Shared section label ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-body font-medium text-primary tracking-[0.2px] leading-normal"
      style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
    >
      {children}
    </p>
  )
}

// ─── Toggle switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className="relative flex-shrink-0 overflow-hidden transition-colors duration-200 disabled:opacity-40"
      style={{
        width:      40,
        height:     24,
        background: enabled ? 'var(--color-purple)' : 'var(--color-border)',
      }}
      aria-checked={enabled}
      role="switch"
    >
      <motion.span
        className="absolute top-[4px] w-4 h-4 bg-white pointer-events-none"
        animate={{ left: enabled ? 20 : 4 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </button>
  )
}

// ─── Edit Profile Bottom Sheet ────────────────────────────────────────────────

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
  onBgReset,
  userId,
  isDev,
  memberSinceYear,
  groupChats,
  totalMessages,
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
  onBgReset:          () => void
  userId:             string
  isDev:              boolean
  memberSinceYear:    string
  groupChats:         number
  totalMessages:      number
}) {
  const [displayName,   setDisplayName]   = useState(initialDisplayName)
  const [status,        setStatus]        = useState(initialStatus)
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [pendingFile,   setPendingFile]   = useState<File | null>(null)
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
    if (!trimmed || trimmed.length < 3) { setSaveError('Name must be at least 3 characters'); return }
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await updateProfileDetailsAction(trimmed, status.trim())
      if (result.error === 'taken') { setSaveError('Name already taken'); return }
      if (result.error) { setSaveError('Failed to save — try again'); return }
      onSave(trimmed, status.trim())
      onClose()
    } catch {
      setSaveError('Failed to save — try again')
    } finally {
      setSaving(false)
    }
  }

  const msgFormatted = totalMessages.toLocaleString()
  const initial      = initialDisplayName[0]?.toUpperCase() ?? '?'
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
              className="relative w-full max-w-[480px] bg-black border-t border-[var(--color-border)] flex flex-col overflow-hidden"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 1 }}
              onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
              style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Profile hero — 280px full-bleed */}
              <div
                className="relative flex flex-col items-end justify-between overflow-hidden shrink-0 w-full"
                style={{ height: 280, padding: 16 }}
              >
                {/* Background image */}
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

                {/* Top-right: background edit button */}
                <button
                  onClick={onBgUpload}
                  className="relative bg-surface border border-primary flex items-center overflow-hidden p-2"
                  style={{ boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)' }}
                  aria-label="Edit cover"
                >
                  <MagicEdit style={{ width: 12, height: 12, color: 'var(--color-primary)' }} />
                </button>

                {/* Bottom: profile details */}
                <div className="relative flex items-center w-full" style={{ gap: 16 }}>
                  {/* Avatar 56×56 — tappable to change photo */}
                  <div className="relative flex-shrink-0" style={{ width: 56, height: 56 }}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="relative w-full h-full overflow-hidden"
                      style={{ background: 'var(--color-primary)' }}
                      aria-label="Change photo"
                    >
                      {avatarUrl ? (
                        <Image src={resolveAvatarUrl(avatarUrl, 56)} alt={previewName} fill sizes="56px" className="object-cover" unoptimized={isSupabaseStorage(avatarUrl)} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="font-pixel text-[12px] text-purple">{initial}</span>
                        </div>
                      )}
                    </button>
                    {/* Edit badge — decorative, positioned relative to outer div */}
                    <div
                      className="absolute bg-surface border border-primary flex items-center overflow-hidden p-2 pointer-events-none"
                      style={{ top: -8, left: 36, boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)' }}
                      aria-hidden="true"
                    >
                      <MagicEdit style={{ width: 12, height: 12, color: 'var(--color-primary)' }} />
                    </div>
                  </div>

                  {/* Name / stats */}
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

              {/* Status ticker — live preview of status field */}
              <ProfileStatusTicker status={status.trim() || 'Whats the mood today...'} />

              {/* Form section */}
              <div className="flex flex-col items-start w-full" style={{ gap: 24, paddingTop: 16, paddingLeft: 16, paddingRight: 16 }}>
                {/* Fields */}
                <div className="flex flex-col items-start w-full" style={{ gap: 16 }}>

                  {/* Display Name */}
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

                  {/* Status */}
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

                {/* Save error */}
                {saveError && (
                  <p className="font-pixel text-[8px] text-[#ef4444] -mt-4">{saveError}</p>
                )}

                {/* Save Changes button */}
                <Button
                  onClick={handleSave}
                  disabled={saving || !displayName.trim() || displayName.trim().length < 3}
                  loading={saving}
                  className="w-full"
                >
                  Save Changes
                </Button>
              </div>
            </motion.div>
          </motion.div>

          {/* File input outside the transformed motion.div — iOS Safari drops .click() inside transforms */}
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
                borderColor: '#ef4444',
                padding: 'var(--space-7) var(--space-5)',
                paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))',
              }}
            >
              <div className="flex flex-col gap-[var(--space-3)]">
                <p
                  className="font-body font-bold leading-none"
                  style={{ fontSize: 'var(--text-lg)', color: '#ef4444', fontVariationSettings: '"opsz" 14' }}
                >
                  Delete Account
                </p>
                <p
                  className="font-body font-normal leading-relaxed tracking-[0.2px]"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
                >
                  Your account will be permanently deleted in <span style={{ color: 'var(--color-primary)' }}>7 days</span>. All your messages, XP, crew memberships, friends, and profile data will be erased and cannot be recovered.
                </p>
                <p
                  className="font-body font-normal leading-relaxed tracking-[0.2px]"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
                >
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

// ─── Account Details bottom sheet ────────────────────────────────────────────

function AccountDetailsSheet({
  isOpen,
  onClose,
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
  isOpen:            boolean
  onClose:           () => void
  userEmail:         string
  isGuest:           boolean
  deletePending:     boolean
  localDeleteAt:     string | null
  loggingOut:        boolean
  onLogout:          () => void
  cancellingDelete:  boolean
  onCancelDeletion:  () => void
  onOpenDeleteSheet: () => void
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
              className="bg-black border-t border-border overflow-hidden flex flex-col gap-[var(--space-7)]"
              style={{
                paddingTop: 'var(--space-7)',
                paddingLeft: 'var(--space-5)',
                paddingRight: 'var(--space-5)',
                paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
              }}
            >
              {/* Header */}
              <div className="flex flex-col gap-[var(--space-2)] w-full">
                <p
                  className="font-body font-bold text-primary leading-none w-full"
                  style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
                >
                  Account
                </p>
                <p
                  className="font-body font-normal leading-normal w-full"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
                >
                  {'Signed in with '}
                  <span style={{ color: 'var(--color-primary)' }}>{userEmail}</span>
                </p>
              </div>

              {/* Deletion pending notice */}
              {deletePending && localDeleteAt && (
                <div
                  className="flex flex-col gap-[var(--space-2)] p-[var(--space-4)]"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  <p className="font-silkscreen leading-relaxed" style={{ fontSize: 'var(--text-mini)', color: '#ef4444' }}>
                    Account deletion scheduled
                  </p>
                  <p className="font-body font-normal leading-normal tracking-[0.2px]" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}>
                    Permanent deletion on{' '}
                    <span style={{ color: 'var(--color-primary)' }}>
                      {new Date(localDeleteAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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

              {/* Buttons */}
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
        </>
      )}
    </AnimatePresence>
  )
}

// ─── BackButton (inside SlidePage context) ────────────────────────────────────

function BackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex items-center justify-center border border-border flex-shrink-0"
      style={{
        padding: 'var(--x3)',
        background: 'rgba(0,0,0,0)',
        backdropFilter: 'blur(7px)',
        WebkitBackdropFilter: 'blur(7px)',
        boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
      }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
    </button>
  )
}

// ─── ProfileClient ────────────────────────────────────────────────────────────

export function ProfileClient({
  userId, userEmail, initialUsername, avatarUrl, avatarClass, customAvatar, backgroundUrl,
  isDev, isGuest, memberSinceYear, totalMessages, groupChats, inviterUsername, initialStatus, pendingDeleteAt,
  coins, totalFriendshipXP, initialNotes, initialSections, notesCrews,
}: ProfileClientProps) {
  const router = useRouter()

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'notes' | 'settings'>('notes')
  const tabDirRef = useRef(1) // +1 = notes→settings (enter from right); -1 = settings→notes (enter from left)
  const notesRef  = useRef<NotesGridHandle>(null)
  function switchTab(tab: 'notes' | 'settings') {
    if (tab === activeTab) return
    tabDirRef.current = tab === 'notes' ? -1 : 1
    setActiveTab(tab)
  }

  // ── Avatar upload + reset ─────────────────────────────────────────────────
  const [localAvatarUrl,    setLocalAvatarUrl]    = useState(avatarUrl)
  const [localCustomAvatar, setLocalCustomAvatar] = useState(customAvatar)
  const [pendingFile,       setPendingFile]       = useState<File | null>(null)
  const [resettingAvatar,   setResettingAvatar]   = useState(false)
  const fileInputRef                              = useRef<HTMLInputElement>(null)

  async function handleResetAvatar() {
    if (resettingAvatar) return
    setResettingAvatar(true)
    try {
      const result = await resetAvatarAction()
      if (!result.error) {
        setLocalAvatarUrl(result.avatarUrl ?? null)
        setLocalCustomAvatar(false)
      }
    } finally {
      setResettingAvatar(false)
    }
  }

  // ── Background upload + reset ─────────────────────────────────────────────
  const [localBackgroundUrl, setLocalBackgroundUrl] = useState(backgroundUrl)
  const [pendingBgFile,      setPendingBgFile]      = useState<File | null>(null)
  const [resettingBg,        setResettingBg]        = useState(false)
  const bgFileInputRef                              = useRef<HTMLInputElement>(null)

  async function handleResetBackground() {
    if (resettingBg) return
    setResettingBg(true)
    try {
      const result = await resetBackgroundAction()
      if (!result.error) setLocalBackgroundUrl(null)
    } finally {
      setResettingBg(false)
    }
  }

  // ── Profile edit sheet ────────────────────────────────────────────────────
  const [showEditSheet, setShowEditSheet] = useState(false)
  const [localUsername,    setLocalUsername]    = useState(initialUsername)
  const [localStatus,      setLocalStatus]      = useState(initialStatus ?? '')

  // ── Notifications ─────────────────────────────────────────────────────────
  const [showNotifSheet,   setShowNotifSheet]   = useState(false)
  const [showAccountSheet, setShowAccountSheet] = useState(false)
  const [prefs,          setPrefs]          = useState<NotifPrefs>({ messages: true, mentions: true })

  const fetchPrefs = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('notification_preferences')
      .select('notif_messages, notif_mentions')
      .eq('user_id', userId).maybeSingle()
    if (data) setPrefs({
      messages: data.notif_messages as boolean,
      mentions: data.notif_mentions as boolean,
    })
  }, [userId])

  useEffect(() => { fetchPrefs() }, [fetchPrefs])

  async function handleTogglePref(key: keyof NotifPrefs) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    const supabase = createClient()
    await supabase.from('notification_preferences').upsert({
      user_id:        userId,
      notif_messages: next.messages,
      notif_mentions: next.mentions,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

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
      if (!result.error) {
        router.push('/login')
      }
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

  // ── AFK EXP (dev feature flag) ───────────────────────────────────────────
  const [afkExp, setAfkExp] = useState(false)
  useEffect(() => {
    setAfkExp(localStorage.getItem('nexus_afk_exp') === '1')
    const handler = (e: Event) => setAfkExp((e as CustomEvent<{ on: boolean }>).detail.on)
    window.addEventListener('nexus-afk-exp-change', handler)
    return () => window.removeEventListener('nexus-afk-exp-change', handler)
  }, [])

  const initial      = localUsername[0]?.toUpperCase() ?? '?'
  const msgFormatted = totalMessages.toLocaleString()

  const fxpPerLevel = 100
  const fxpLevel    = Math.floor(totalFriendshipXP / fxpPerLevel) + 1
  const fxpProgress = totalFriendshipXP % fxpPerLevel
  const fxpPercent  = (fxpProgress / fxpPerLevel) * 100

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* ── Hero section — full bleed: 280px content + safe area at top ──── */}
      <div className="relative flex-shrink-0 w-full bg-black overflow-hidden" style={{ height: 'calc(280px + env(safe-area-inset-top, 0px))' }}>

        {/* Background image — plain img avoids next/image iOS PWA rendering issues */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={localBackgroundUrl ?? '/img/default_image.png'}
          alt=""
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />

        {/* Full-height gradient — transparent top → black bottom */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 48.668%, rgba(0,0,0,0.8) 82.216%, rgb(0,0,0) 100%)' }}
        />

        {/* Content anchored to bottom */}
        <div className="absolute inset-0 flex flex-col justify-end gap-[var(--space-5)] p-[var(--space-5)]">

          {/* Details row */}
          <div className="flex items-center gap-[var(--space-5)] w-full">
            {/* Avatar 56×56 — display only */}
            <div className="flex-shrink-0 relative overflow-hidden bg-primary rounded-full" style={{ width: 56, height: 56 }}>
              {localAvatarUrl ? (
                <Image src={resolveAvatarUrl(localAvatarUrl, 56)} alt={localUsername} fill sizes="56px" className="object-cover" priority unoptimized={isSupabaseStorage(localAvatarUrl)} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-pixel text-[12px] text-purple">{initial}</span>
                </div>
              )}
            </div>

            {/* Name + stats */}
            <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] justify-center leading-none">
              {memberSinceYear && (
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                  Member Since {memberSinceYear}
                </p>
              )}
              <p className="font-body font-bold truncate" style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
                {localUsername}
              </p>
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                {groupChats} group chat{groupChats !== 1 ? 's' : ''} · {msgFormatted} msg
              </p>
              {inviterUsername && (
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                  Recruited by {inviterUsername}
                </p>
              )}
            </div>
          </div>

          {/* Friendship XP bar */}
          <div className="flex flex-col w-full" style={{ gap: 8 }}>
            <p className="font-silkscreen leading-none w-full" style={{ fontSize: 'var(--text-mini)' }}>
              <span style={{ color: 'var(--color-secondary)' }}>Friendship lv {fxpLevel}</span>
              <span style={{ color: 'var(--color-tertiary)' }}>{` · ${fxpProgress} / 100xp`}</span>
            </p>
            <div className="w-full overflow-hidden" style={{ height: 4, background: 'var(--color-surface)' }}>
              <div style={{ width: `${fxpPercent}%`, height: 4, background: 'linear-gradient(to right, #a855f7, #d946ef)' }} />
            </div>
          </div>

          {/* AFK EXP row — dev-only */}
          {afkExp && (
            <div className="flex items-center gap-2 w-full">
              <div className="flex flex-1 flex-col gap-2 min-w-0">
                <p className="font-silkscreen leading-none w-full" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-primary)' }}>
                  AFK EXP accumulated · 100 / 100 XP
                </p>
                <div className="bg-purple w-full" style={{ height: 4 }} />
              </div>
              <button
                className="bg-purple flex-shrink-0 flex items-center justify-center"
                style={{ paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingTop: 'var(--space-3)', paddingBottom: 'var(--space-3)' }}
              >
                <span className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-primary)' }}>CLAIM</span>
              </button>
            </div>
          )}
        </div>

        {/* Top gradient overlay — covers safe area + 86px below for back button readability */}
        <div
          className="absolute left-0 right-0 top-0 pointer-events-none"
          style={{
            height:     'calc(86px + env(safe-area-inset-top, 0px))',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 46.158%, rgba(0,0,0,0) 100%)',
          }}
        />

        {/* Top bar: back button (left) + stat badges (right) */}
        <div
          className="absolute z-20 left-0 right-0 flex items-center justify-between pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)', paddingLeft: 16, paddingRight: 16 }}
        >
          {/* Back button */}
          <div className="pointer-events-auto">
            <BackButton />
          </div>

          {/* SettingsCog — glass effect matching back button */}
          <button
            onClick={() => switchTab('settings')}
            aria-label="Settings"
            className="flex items-center justify-center border border-border flex-shrink-0 pointer-events-auto"
            style={{
              padding: 'var(--x3)',
              background: 'rgba(0,0,0,0)',
              backdropFilter: 'blur(7px)',
              WebkitBackdropFilter: 'blur(7px)',
              boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
            }}
          >
            <SettingsCog style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>
        </div>

      </div>

      {/* ── Status ticker — full-width row between hero and body ──────────── */}
      {localStatus && <ProfileStatusTicker status={localStatus} />}

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button
          onClick={() => switchTab('notes')}
          className="flex-1 flex items-center justify-center font-silkscreen"
          style={{ height: 40, fontSize: 'var(--text-mini)', color: activeTab === 'notes' ? 'var(--color-primary)' : 'var(--color-tertiary)', boxShadow: activeTab === 'notes' ? 'inset 0 -2px 0 var(--color-purple)' : 'none' }}
        >
          VIBES
        </button>
        <button
          onClick={() => switchTab('settings')}
          className="flex-1 flex items-center justify-center font-silkscreen"
          style={{ height: 40, fontSize: 'var(--text-mini)', color: activeTab === 'settings' ? 'var(--color-primary)' : 'var(--color-tertiary)', boxShadow: activeTab === 'settings' ? 'inset 0 -2px 0 var(--color-purple)' : 'none' }}
        >
          SETTINGS
        </button>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'notes' ? (
          <motion.div
            key="notes"
            className="flex-1 min-h-0"
            initial={{ opacity: 0, x: tabDirRef.current * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tabDirRef.current * -16 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <NotesGrid
              ref={notesRef}
              viewerId={userId}
              initialNotes={initialNotes}
              initialSections={initialSections}
              crews={notesCrews}
              initialCrewId={notesCrews[0]?.id ?? ''}
              lockCrew={false}
              creatorFilter={userId}
            />
          </motion.div>
        ) : (
          <motion.div
            key="settings"
            className="flex-1 overflow-y-auto flex flex-col nexus-scroll"
            style={{ padding: '24px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
            initial={{ opacity: 0, x: tabDirRef.current * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tabDirRef.current * -16 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
        <div className="flex flex-col" style={{ gap: 24 }}>

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

          {/* Notification */}
          <button
            onClick={() => setShowNotifSheet(true)}
            className="w-full flex gap-3 items-center text-left"
            style={{ minHeight: 34 }}
          >
            <Bell style={{ width: 20, height: 20, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
            <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
              <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                Notification
              </p>
              <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                Control what pulls you back into the chat.
              </p>
            </div>
            <ChevronRight style={{ width: 20, height: 20, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
          </button>

          {/* Account Details */}
          <button
            onClick={() => setShowAccountSheet(true)}
            className="w-full flex gap-3 items-center text-left"
            style={{ minHeight: 34 }}
          >
            <User style={{ width: 20, height: 20, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
            <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
              <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                Account Details
              </p>
              <p className="font-body font-normal text-tertiary leading-normal truncate" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                Signed in with {userEmail}
              </p>
            </div>
            <ChevronRight style={{ width: 20, height: 20, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
          </button>

          {/* Developer Page — dev users only */}
          {isDev && (
            <button
              onClick={() => router.push('/profile/developer')}
              className="w-full flex gap-3 items-center text-left"
              style={{ minHeight: 34 }}
            >
              <Terminal style={{ width: 20, height: 20, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
              <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
                <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                  Developer Page
                </p>
                <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                  Debug, Manage, and Test new features
                </p>
              </div>
              <ChevronRight style={{ width: 20, height: 20, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
            </button>
          )}

        </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Profile bottom sheet */}
      <EditProfileSheet
        isOpen={showEditSheet}
        onClose={() => setShowEditSheet(false)}
        onSave={(displayName, status) => {
          setLocalUsername(displayName)
          setLocalStatus(status)
          revalidateProfileAction()
        }}
        onAvatarChange={(url) => { setLocalAvatarUrl(url); setLocalCustomAvatar(true) }}
        initialDisplayName={localUsername}
        initialStatus={localStatus}
        avatarUrl={localAvatarUrl}
        backgroundUrl={localBackgroundUrl}
        onBgUpload={() => bgFileInputRef.current?.click()}
        onBgReset={handleResetBackground}
        userId={userId}
        isDev={isDev}
        memberSinceYear={memberSinceYear}
        groupChats={groupChats}
        totalMessages={totalMessages}
      />

      {/* Notification bottom sheet */}
      <AnimatePresence>
        {showNotifSheet && (
          <NotifSheet
            prefs={prefs}
            onToggle={handleTogglePref}
            onClose={() => setShowNotifSheet(false)}
          />
        )}
      </AnimatePresence>

      {/* Account details bottom sheet */}
      <AccountDetailsSheet
        isOpen={showAccountSheet}
        onClose={() => setShowAccountSheet(false)}
        userEmail={userEmail}
        isGuest={isGuest}
        deletePending={deletePending}
        localDeleteAt={localDeleteAt}
        loggingOut={loggingOut}
        onLogout={handleLogout}
        cancellingDelete={cancellingDelete}
        onCancelDeletion={handleCancelDeletion}
        onOpenDeleteSheet={() => {
          setShowAccountSheet(false)
          setShowDeleteSheet(true)
        }}
      />

      {/* Avatar upload — hero avatar button */}
      <AvatarUploadModal
        file={pendingFile}
        userId={userId}
        isDev={isDev}
        onClose={() => setPendingFile(null)}
        onSuccess={(url) => {
          setLocalAvatarUrl(url)
          setLocalCustomAvatar(true)
          setPendingFile(null)
        }}
      />

      {/* Hidden background file input — used by EditProfileSheet's cover upload */}
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

      {/* Background upload */}
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

