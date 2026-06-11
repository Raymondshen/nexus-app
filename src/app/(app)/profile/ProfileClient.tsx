'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/lib/supabase/auth'
import { isSupported, getPermissionState, requestPermission, subscribeToPush } from '@/lib/notifications'
import type { PermissionState } from '@/lib/notifications'
import { revalidateProfileAction, resetAvatarAction, updateProfileDetailsAction } from './actions'
import {
  getAllAnnouncementsAction,
  createAnnouncementAction,
  updateAnnouncementAction,
  toggleAnnouncementAction,
  deleteAnnouncementAction,
} from '@/app/(app)/home/actions'
import { AvatarUploadModal } from '@/components/ui/AvatarUploadModal'
import type { Announcement } from '@/types'

interface ProfileClientProps {
  userId:          string
  userEmail:       string
  initialUsername: string
  avatarUrl:       string | null
  avatarClass:     string | null
  customAvatar:    boolean
  isDev:           boolean
  isGuest:         boolean
  memberSinceYear: string
  totalMessages:   number
  groupChats:      number
  inviterUsername: string | null
  initialStatus:   string | null
}

type NotifPrefs = {
  notif_messages: boolean
  notif_raids:    boolean
  notif_victory:  boolean
}

const DEFAULT_PREFS: NotifPrefs = {
  notif_messages: true,
  notif_raids:    true,
  notif_victory:  true,
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
        background: enabled ? '#a855f7' : '#27272a',
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

// ─── Notification row ──────────────────────────────────────────────────────────

function NotifRow({
  label, sub, prefKey, prefs, savingPref, onToggle, showDivider,
}: {
  label: string; sub: string
  prefKey: keyof NotifPrefs
  prefs: NotifPrefs
  savingPref: keyof NotifPrefs | null
  onToggle: (k: keyof NotifPrefs) => void
  showDivider: boolean
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-4">
        <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
          <p
            className="font-body font-semibold text-secondary leading-normal"
            style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
          >
            {label}
          </p>
          <p
            className="font-body font-normal text-tertiary leading-normal"
            style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
          >
            {sub}
          </p>
        </div>
        <ToggleSwitch
          enabled={prefs[prefKey]}
          onChange={() => onToggle(prefKey)}
          disabled={savingPref === prefKey}
        />
      </div>
      {showDivider && <div className="h-px bg-border mx-0" />}
    </>
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
              className="bg-black border-t overflow-hidden flex flex-col gap-[var(--space-7)]"
              style={{
                borderColor: 'var(--color-border-hover)',
                padding: 'var(--space-7) var(--space-5)',
                paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))',
              }}
            >
              {/* Title */}
              <p
                className="font-body font-bold text-primary leading-none"
                style={{ fontSize: 'var(--text-lg)', fontVariationSettings: '"opsz" 14' }}
              >
                Account Details
              </p>

              {/* Mini profile hero — live preview */}
              <div
                className="relative w-full overflow-hidden flex flex-col gap-[var(--space-5)] items-start justify-end"
                style={{ height: 180, padding: 'var(--space-5)' }}
              >
                {/* Background image — plain img avoids next/image iOS PWA rendering issues */}
                <img
                  src="/img/default_image.png"
                  alt=""
                  aria-hidden
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 48.668%, rgba(0,0,0,0.8) 82.216%, rgb(0,0,0) 100%)' }}
                />
                <div className="relative flex gap-[var(--space-5)] items-center w-full">
                  <div className="flex-shrink-0 bg-border overflow-hidden relative" style={{ width: 56, height: 56 }}>
                    {avatarUrl ? (
                      <Image src={resolveAvatarUrl(avatarUrl, 56)} alt={previewName} fill sizes="56px" className="object-cover" unoptimized={isSupabaseStorage(avatarUrl)} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="font-pixel text-[12px] text-purple">{initial}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] justify-center leading-none">
                    {memberSinceYear && (
                      <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
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
                <p
                  className="relative font-body font-normal leading-none w-full"
                  style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14', color: status.trim() ? 'var(--color-secondary)' : 'var(--color-tertiary)' }}
                >
                  &ldquo;{status.trim() || 'Whats the mood today...'}&rdquo;
                </p>
              </div>

              {/* Editable fields */}
              <div className="flex flex-col gap-[var(--space-5)]">

              {/* Profile Picture */}
              <div className="flex flex-col gap-2">
                <p
                  className="font-body font-medium text-primary tracking-[0.2px] leading-normal"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                >
                  Profile Picture
                </p>
                <div className="flex items-center gap-[var(--space-5)]">
                  <div className="relative flex-shrink-0 w-12 h-12 overflow-hidden bg-purple">
                    {avatarUrl && (
                      <Image
                        src={resolveAvatarUrl(avatarUrl, 48)}
                        alt={initialDisplayName}
                        fill
                        sizes="48px"
                        className="object-cover"
                        unoptimized={isSupabaseStorage(avatarUrl)}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 h-[var(--space-13)] border border-purple flex items-center justify-center overflow-hidden transition-opacity active:opacity-70"
                  >
                    <span
                      className="font-silkscreen leading-none whitespace-nowrap text-purple"
                      style={{ fontSize: 'var(--text-sm)' }}
                    >
                      upload photo
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) setPendingFile(f)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>

              {/* Display Name input */}
              <div className="flex flex-col gap-[var(--space-3)] w-full">
                <p className="font-body font-medium text-primary tracking-[0.2px] leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                  Display Name
                </p>
                <div
                  className="bg-black border h-[48px] flex items-center overflow-hidden px-3 w-full"
                  style={{ borderColor: 'var(--color-border-hover)' }}
                >
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

              {/* Status input */}
              <div className="flex flex-col gap-[var(--space-3)] w-full">
                <p className="font-body font-medium text-primary tracking-[0.2px] leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                  Status
                </p>
                <div
                  className="bg-black border h-[48px] flex items-center overflow-hidden px-3 w-full"
                  style={{ borderColor: 'var(--color-border-hover)' }}
                >
                  <input
                    value={status}
                    onChange={(e) => setStatus(e.target.value.slice(0, 100))}
                    placeholder="Whats the mood today..."
                    className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-tertiary focus:outline-none leading-normal"
                    style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                  />
                </div>
              </div>

              </div>{/* end editable fields */}

              {/* Save error */}
              {saveError && (
                <p className="font-pixel text-[8px] text-[#ef4444] -mt-4">{saveError}</p>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-[var(--space-5)] w-full">
                <button
                  onClick={handleSave}
                  disabled={saving || !displayName.trim() || displayName.trim().length < 3}
                  className="w-full h-[48px] bg-purple flex items-center justify-center overflow-hidden disabled:opacity-50"
                >
                  <span className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-primary)' }}>
                    {saving ? '...' : 'Save Changes'}
                  </span>
                </button>
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="w-full h-[48px] border flex items-center justify-center overflow-hidden"
                  style={{ borderColor: '#ef4444' }}
                >
                  <span className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-sm)', color: '#ef4444' }}>
                    Cancel
                  </span>
                </button>
              </div>
            </div>
          </motion.div>

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

// ─── BackButton (inside SlidePage context) ────────────────────────────────────

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

// ─── ProfileClient ────────────────────────────────────────────────────────────

export function ProfileClient({
  userId, userEmail, initialUsername, avatarUrl, avatarClass, customAvatar, isDev, isGuest,
  memberSinceYear, totalMessages, groupChats, inviterUsername, initialStatus,
}: ProfileClientProps) {
  const router = useRouter()

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

  // ── Profile edit sheet ────────────────────────────────────────────────────
  const [showEditSheet,   setShowEditSheet]   = useState(false)
  const [localUsername,   setLocalUsername]   = useState(initialUsername)
  const [localStatus,     setLocalStatus]     = useState(initialStatus ?? '')

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifSupported,  setNotifSupported]  = useState(false)
  const [notifPermission, setNotifPermission] = useState<PermissionState>('unsupported')
  const [enablingNotif,   setEnablingNotif]   = useState(false)
  const [subError,        setSubError]        = useState(false)
  const [prefs,           setPrefs]           = useState<NotifPrefs>(DEFAULT_PREFS)
  const [prefsLoading,    setPrefsLoading]    = useState(false)
  const [savingPref,      setSavingPref]      = useState<keyof NotifPrefs | null>(null)

  const fetchPrefs = useCallback(async () => {
    setPrefsLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('notification_preferences')
        .select('notif_messages, notif_raids, notif_victory')
        .eq('user_id', userId).maybeSingle()
      if (data) setPrefs({
        notif_messages: data.notif_messages as boolean,
        notif_raids:    data.notif_raids    as boolean,
        notif_victory:  data.notif_victory  as boolean,
      })
    } finally {
      setPrefsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    const supported  = isSupported()
    const permission = getPermissionState()
    setNotifSupported(supported)
    setNotifPermission(permission)
    if (supported && permission === 'granted') fetchPrefs()
  }, [fetchPrefs])

  async function handleEnableNotifications() {
    setEnablingNotif(true); setSubError(false)
    try {
      const state = await requestPermission()
      setNotifPermission(state)
      if (state === 'granted') {
        const sub = await subscribeToPush()
        if (!sub) setSubError(true)
        fetchPrefs()
      }
    } finally {
      setEnablingNotif(false)
    }
  }

  async function handleTogglePref(key: keyof NotifPrefs) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setSavingPref(key)
    try {
      const supabase = createClient()
      await supabase.from('notification_preferences')
        .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    } finally {
      setSavingPref(null)
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try { await signOut(); router.push('/login') }
    catch { setLoggingOut(false) }
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
  const notifRows    = [
    { key: 'notif_messages' as const, label: 'Messages',    sub: 'Notify me with new messages from this chat' },
    { key: 'notif_raids'    as const, label: 'Raid Alerts', sub: 'Notify me when boss spawns and expires' },
    { key: 'notif_victory'  as const, label: 'Victory',     sub: 'Notify me when boss defeated & artifact drops' },
  ]

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
      backHref="/home"
    >
      {/* ── Hero section — full bleed: 280px content + safe area at top ──── */}
      <div className="relative flex-shrink-0 w-full bg-black overflow-hidden" style={{ height: 'calc(280px + env(safe-area-inset-top, 0px))' }}>

        {/* Background image — plain img avoids next/image iOS PWA rendering issues */}
        <img
          src="/img/default_image.png"
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
            {/* Avatar 56×56 — tappable */}
            <div className="flex-shrink-0 flex flex-col items-center gap-1">
              <button
                onClick={() => !isGuest && fileInputRef.current?.click()}
                disabled={isGuest}
                className="relative overflow-hidden group bg-border"
                style={{ width: 56, height: 56 }}
                aria-label="Change photo"
              >
                {localAvatarUrl ? (
                  <Image src={resolveAvatarUrl(localAvatarUrl, 56)} alt={localUsername} fill sizes="56px" className="object-cover" priority unoptimized={isSupabaseStorage(localAvatarUrl)} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="font-pixel text-[12px] text-purple">{initial}</span>
                  </div>
                )}
                {!isGuest && (
                  <div className="absolute inset-0 bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity pointer-events-none">
                    <span className="font-pixel text-[6px] text-white text-center leading-relaxed">CHANGE<br />PHOTO</span>
                  </div>
                )}
              </button>
              {localCustomAvatar && !isGuest && (
                <button
                  onClick={handleResetAvatar}
                  disabled={resettingAvatar}
                  className="font-silkscreen text-muted leading-none whitespace-nowrap disabled:opacity-40"
                  style={{ fontSize: 7 }}
                >
                  {resettingAvatar ? '...' : 'Use Google photo'}
                </button>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setPendingFile(f)
                e.target.value = ''
              }}
            />

            {/* Name + stats */}
            <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] justify-center leading-none">
              {memberSinceYear && (
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
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

          {/* Status line — shown when set */}
          {localStatus && (
            <p
              className="font-body font-normal leading-none w-full"
              style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14', color: 'var(--color-secondary)' }}
            >
              &ldquo;{localStatus}&rdquo;
            </p>
          )}

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

        {/* Floating back button box — positioned below safe area */}
        <div className="absolute z-20 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)', left: 16 }}>
          <div
            className="pointer-events-auto flex items-center bg-surface border border-purple p-2 overflow-hidden"
            style={{ boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)' }}
          >
            <BackButton />
          </div>
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-[var(--space-7)] nexus-scroll" style={{ padding: 'var(--space-5)' }}>

        {/* Edit Profile card */}
        <button
          onClick={() => setShowEditSheet(true)}
          disabled={isGuest}
          className="w-full bg-surface border flex gap-3 items-center px-[var(--space-5)] py-3 text-left disabled:opacity-50"
          style={{ borderColor: 'var(--color-border-hover)' }}
        >
          <MagicEdit style={{ width: 16, height: 16, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
          <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
            <p className="font-body font-semibold text-secondary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
              Edit Profile
            </p>
            <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}>
              Manage your profile.
            </p>
          </div>
          <ChevronRight style={{ width: 16, height: 16, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
        </button>

        {/* Notifications */}
        <div className="flex flex-col gap-[var(--space-3)]">
          <SectionLabel>Notifications</SectionLabel>
          <div className="bg-surface border overflow-hidden" style={{ borderColor: 'var(--color-border-hover)' }}>
            {!notifSupported ? (
              <div className="px-4 py-4">
                <p className="font-pixel text-[8px] text-muted leading-relaxed">NOT SUPPORTED ON THIS DEVICE</p>
              </div>
            ) : notifPermission === 'denied' ? (
              <div className="px-4 py-4 flex flex-col gap-2">
                <p className="font-pixel text-[8px] text-[#ef4444]">BLOCKED BY BROWSER</p>
                <p className="font-pixel text-[7px] text-muted leading-relaxed">
                  ENABLE IN YOUR BROWSER SETTINGS TO RECEIVE NOTIFICATIONS
                </p>
              </div>
            ) : notifPermission !== 'granted' ? (
              <div className="px-4 py-4 flex flex-col gap-3">
                <p className="font-body font-normal text-tertiary leading-normal" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                  Get notified for messages, boss spawns, and victories
                </p>
                <button
                  onClick={handleEnableNotifications}
                  disabled={enablingNotif}
                  className="w-full h-10 font-pixel text-[8px] text-purple border border-[rgba(168,85,247,0.5)] hover:border-purple transition-colors disabled:opacity-50"
                >
                  {enablingNotif ? '...' : subError ? '↺ RETRY' : 'ENABLE NOTIFICATIONS'}
                </button>
                {subError && (
                  <p className="font-pixel text-[7px] text-[#f59e0b] leading-relaxed">
                    SUBSCRIPTION FAILED — ADD APP TO HOME SCREEN, THEN RETRY
                  </p>
                )}
              </div>
            ) : (
              <div className={`flex flex-col gap-3 py-3${prefsLoading ? ' opacity-50 pointer-events-none' : ''}`}>
                {notifRows.map(({ key, label, sub }, i) => (
                  <NotifRow
                    key={key}
                    prefKey={key}
                    label={label}
                    sub={sub}
                    prefs={prefs}
                    savingPref={savingPref}
                    onToggle={handleTogglePref}
                    showDivider={i < notifRows.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Account */}
        <div className="flex flex-col gap-[var(--space-3)]">
          <div className="flex flex-col gap-[var(--space-2)]">
            <SectionLabel>Account</SectionLabel>
            <p
              className="font-body font-normal leading-normal tracking-[0.2px]"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--color-paper-200)', fontVariationSettings: '"opsz" 14' }}
            >
              {'Signed in with '}
              <span style={{ color: 'var(--color-primary)' }}>{userEmail}</span>
            </p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full h-12 border border-[#ef4444] flex items-center justify-center transition-colors hover:bg-[#ef4444]/8 disabled:opacity-50 overflow-hidden"
          >
            <span className="font-pixel leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-mini)', color: '#ef4444' }}>
              {loggingOut ? '...' : 'LOG OUT'}
            </span>
          </button>
        </div>

        {/* Dev */}
        {isDev && <DevSection userId={userId} userEmail={userEmail} />}

        <div style={{ height: 'max(env(safe-area-inset-bottom), 16px)' }} />
      </div>

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
        userId={userId}
        isDev={isDev}
        memberSinceYear={memberSinceYear}
        groupChats={groupChats}
        totalMessages={totalMessages}
      />
    </SlidePage>
  )
}

// ─── Dev section ──────────────────────────────────────────────────────────────

function DevSection({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [copiedId,     setCopiedId]     = useState(false)
  const [copiedEmail,  setCopiedEmail]  = useState(false)
  const [flagsCleared, setFlagsCleared] = useState(false)
  const [devMode,      setDevMode]      = useState(false)
  const [showPush,     setShowPush]     = useState(false)
  const [infiniteCoins, setInfiniteCoins] = useState(false)
  const [afkExp,        setAfkExp]        = useState(false)
  const [actualCoins,  setActualCoins]  = useState<number | null>(null)
  const [showBanners,  setShowBanners]  = useState(false)
  const [banners,      setBanners]      = useState<Announcement[]>([])
  const [bannersLoading, setBannersLoading] = useState(false)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editingText,  setEditingText]  = useState('')
  const [newText,      setNewText]      = useState('')
  const [addingBanner, setAddingBanner] = useState(false)
  const [bannerError,  setBannerError]  = useState<string | null>(null)

  async function loadBanners() {
    setBannersLoading(true)
    const result = await getAllAnnouncementsAction()
    setBannersLoading(false)
    if ('data' in result) setBanners(result.data ?? [])
  }

  async function handleCreateBanner() {
    if (!newText.trim() || addingBanner) return
    setAddingBanner(true)
    setBannerError(null)
    const result = await createAnnouncementAction(newText.trim())
    setAddingBanner(false)
    if (result.error) { setBannerError(result.error); return }
    setNewText('')
    loadBanners()
  }

  async function handleUpdateBanner(id: string) {
    if (!editingText.trim()) return
    const result = await updateAnnouncementAction(id, editingText.trim())
    if (result.error) { setBannerError(result.error); return }
    setEditingId(null)
    loadBanners()
  }

  async function handleToggleBanner(id: string, active: boolean) {
    const result = await toggleAnnouncementAction(id, !active)
    if (result.error) setBannerError(result.error)
    else loadBanners()
  }

  async function handleDeleteBanner(id: string) {
    const result = await deleteAnnouncementAction(id)
    if (result.error) setBannerError(result.error)
    else {
      setBanners(prev => prev.filter(b => b.id !== id))
    }
  }

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
    setShowPush(localStorage.getItem('nexus_push_diag') === '1')
    setInfiniteCoins(localStorage.getItem('nexus_infinite_coins') === '1')
    setAfkExp(localStorage.getItem('nexus_afk_exp') === '1')
    const supabase = createClient()
    supabase.from('profiles').select('coins').eq('id', userId).maybeSingle().then(({ data }) => {
      if (data) setActualCoins((data as { coins: number }).coins)
    })
  }, [userId])

  useEffect(() => {
    if (showBanners) loadBanners()
  }, [showBanners]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDevMode() {
    const next = !devMode
    setDevMode(next)
    if (next) localStorage.setItem('nexus_dev_mode', '1')
    else localStorage.removeItem('nexus_dev_mode')
  }

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

  function toggleAfkExp() {
    const next = !afkExp
    setAfkExp(next)
    if (next) localStorage.setItem('nexus_afk_exp', '1')
    else localStorage.removeItem('nexus_afk_exp')
    window.dispatchEvent(new CustomEvent('nexus-afk-exp-change', { detail: { on: next } }))
  }

  function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  function clearLocalFlags() {
    ['nexus_first_message','nexus_install_prompted','nexus_crew_created','nexus_notif_prompted','nexus_notif_state']
      .forEach((k) => localStorage.removeItem(k))
    setFlagsCleared(true)
    setTimeout(() => setFlagsCleared(false), 2000)
  }

  const rowClass  = 'flex items-center justify-between px-4 py-4 gap-4'
  const labelClass = 'font-body font-medium text-[14px] tracking-[0.2px] leading-normal'

  return (
    <div className="flex flex-col gap-2">
      <p className={labelClass} style={{ color: '#ffd700', fontVariationSettings: '"opsz" 14' }}>Dev</p>
      <div className="bg-surface border border-[rgba(255,215,0,0.25)] overflow-hidden divide-y divide-border">

        <div className={rowClass}>
          <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
            <p className="font-body font-medium text-[14px] text-secondary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Spawn Boss Mode</p>
            <p className="font-body font-normal text-[12px] text-tertiary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Shows boss spawn button in chat for testing</p>
          </div>
          <ToggleSwitch enabled={devMode} onChange={toggleDevMode} />
        </div>

        <div className={rowClass}>
          <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
            <p className="font-body font-medium text-[14px] text-secondary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Push Diagnostics</p>
            <p className="font-body font-normal text-[12px] text-tertiary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Show push subscription tools below</p>
          </div>
          <ToggleSwitch enabled={showPush} onChange={toggleShowPush} />
        </div>

        <div className={rowClass}>
          <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
            <p className="font-body font-medium text-[14px] text-secondary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Infinite Coins</p>
            <p className="font-body font-normal text-[12px] text-tertiary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>
              {infiniteCoins ? 'Unlimited coins (testing only)' : `Balance: ${actualCoins === null ? '...' : actualCoins.toLocaleString()} coins`}
            </p>
          </div>
          <ToggleSwitch enabled={infiniteCoins} onChange={toggleInfiniteCoins} />
        </div>

        <div className={rowClass}>
          <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
            <p className="font-body font-medium text-[14px] text-secondary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Feat: AFK Exp</p>
            <p className="font-body font-normal text-[12px] text-tertiary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Show AFK XP bar and Claim button on home screen</p>
          </div>
          <ToggleSwitch enabled={afkExp} onChange={toggleAfkExp} />
        </div>

        <div className="px-4 py-4 flex flex-col gap-2">
          <p className="font-body font-medium text-[14px] text-secondary leading-normal tracking-[0.2px]" style={{ fontVariationSettings: '"opsz" 14' }}>User ID</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-sans text-[11px] text-[#ffd700] truncate select-all">{userId}</code>
            <button
              onClick={() => copyToClipboard(userId, setCopiedId)}
              className="flex-shrink-0 font-pixel text-[7px] px-2 py-1.5 border transition-colors"
              style={{ color: copiedId ? '#66bb6a' : '#ffd700', borderColor: copiedId ? 'rgba(102,187,106,0.4)' : 'rgba(255,215,0,0.3)', background: copiedId ? 'rgba(102,187,106,0.08)' : 'rgba(255,215,0,0.06)' }}
            >
              {copiedId ? '✓' : 'COPY'}
            </button>
          </div>
        </div>

        <div className="px-4 py-4 flex flex-col gap-2">
          <p className="font-body font-medium text-[14px] text-secondary leading-normal tracking-[0.2px]" style={{ fontVariationSettings: '"opsz" 14' }}>Email</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-sans text-[11px] text-[#ffd700] truncate select-all">{userEmail}</code>
            <button
              onClick={() => copyToClipboard(userEmail, setCopiedEmail)}
              className="flex-shrink-0 font-pixel text-[7px] px-2 py-1.5 border transition-colors"
              style={{ color: copiedEmail ? '#66bb6a' : '#ffd700', borderColor: copiedEmail ? 'rgba(102,187,106,0.4)' : 'rgba(255,215,0,0.3)', background: copiedEmail ? 'rgba(102,187,106,0.08)' : 'rgba(255,215,0,0.06)' }}
            >
              {copiedEmail ? '✓' : 'COPY'}
            </button>
          </div>
        </div>

        <div className="px-4 py-4 flex flex-col gap-2">
          <p className="font-body font-medium text-[14px] text-secondary leading-normal tracking-[0.2px]" style={{ fontVariationSettings: '"opsz" 14' }}>Local Flags</p>
          <p className="font-body font-normal text-[12px] text-tertiary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>
            Clears install prompt, notification prompt, and first-message flags for retesting onboarding.
          </p>
          <button onClick={clearLocalFlags} className="w-full h-9 font-pixel text-[8px] border transition-colors"
            style={{ color: flagsCleared ? '#66bb6a' : '#ffd700', borderColor: flagsCleared ? 'rgba(102,187,106,0.4)' : 'rgba(255,215,0,0.3)', background: flagsCleared ? 'rgba(102,187,106,0.08)' : 'rgba(255,215,0,0.06)' }}>
            {flagsCleared ? '✓ CLEARED' : 'RESET FLAGS'}
          </button>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">
          <button onClick={() => setShowBanners(v => !v)} className="flex items-center justify-between w-full">
            <p className="font-body font-medium text-[14px] text-secondary leading-normal tracking-[0.2px]" style={{ fontVariationSettings: '"opsz" 14' }}>Announcements</p>
            <span className="font-pixel text-[8px] transition-colors" style={{ color: '#ffd700' }}>
              {showBanners ? '▲ HIDE' : '▼ MANAGE'}
            </span>
          </button>

          {showBanners && (
            <div className="flex flex-col gap-3">
              {bannerError && <p className="font-pixel text-[7px] text-[#ff4444] leading-none">{bannerError}</p>}
              {bannersLoading ? (
                <p className="font-pixel text-[7px] text-muted">Loading...</p>
              ) : banners.length === 0 ? (
                <p className="font-pixel text-[7px] text-muted">No announcements yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {banners.map((b) => (
                    <div key={b.id} className="border flex flex-col gap-2 p-3" style={{ borderColor: b.active ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)', background: b.active ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.02)' }}>
                      {editingId === b.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea value={editingText} onChange={(e) => setEditingText(e.target.value.slice(0, 500))} className="w-full bg-black border border-border px-3 py-2 font-body text-[13px] text-primary resize-none focus:outline-none focus:border-purple" rows={3} maxLength={500} autoFocus />
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateBanner(b.id)} className="flex-1 h-8 font-pixel text-[7px] border" style={{ color: '#66bb6a', borderColor: 'rgba(102,187,106,0.4)', background: 'rgba(102,187,106,0.08)' }}>SAVE</button>
                            <button onClick={() => { setEditingId(null); setBannerError(null) }} className="flex-1 h-8 font-pixel text-[7px] border" style={{ color: '#ffd700', borderColor: 'rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.06)' }}>CANCEL</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-body text-[13px] leading-snug" style={{ color: b.active ? 'var(--color-primary)' : 'var(--color-muted)', fontVariationSettings: '"opsz" 14' }}>{b.text}</p>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleToggleBanner(b.id, b.active)} className="font-pixel text-[7px] px-2 py-1 border transition-colors" style={{ color: b.active ? '#66bb6a' : '#a1a1aa', borderColor: b.active ? 'rgba(102,187,106,0.4)' : 'rgba(161,161,170,0.3)', background: b.active ? 'rgba(102,187,106,0.08)' : 'rgba(161,161,170,0.06)' }}>{b.active ? 'ACTIVE' : 'INACTIVE'}</button>
                            <button onClick={() => { setEditingId(b.id); setEditingText(b.text); setBannerError(null) }} className="font-pixel text-[7px] px-2 py-1 border" style={{ color: '#ffd700', borderColor: 'rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.06)' }}>EDIT</button>
                            <button onClick={() => handleDeleteBanner(b.id)} className="font-pixel text-[7px] px-2 py-1 border ml-auto" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>DELETE</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <textarea value={newText} onChange={(e) => setNewText(e.target.value.slice(0, 500))} placeholder="New announcement text..." className="w-full bg-black border border-border px-3 py-2 font-body text-[13px] text-primary placeholder:text-muted resize-none focus:outline-none focus:border-purple" rows={2} maxLength={500} />
                <button onClick={handleCreateBanner} disabled={!newText.trim() || addingBanner} className="w-full h-9 font-pixel text-[8px] border transition-colors disabled:opacity-40" style={{ color: '#ffd700', borderColor: 'rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.06)' }}>
                  {addingBanner ? '...' : '+ ADD ANNOUNCEMENT'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
