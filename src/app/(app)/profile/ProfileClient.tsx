'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/lib/supabase/auth'
import { isSupported, getPermissionState, requestPermission, subscribeToPush } from '@/lib/notifications'
import type { PermissionState } from '@/lib/notifications'

interface ProfileClientProps {
  userId:          string
  userEmail:       string
  initialUsername: string
  avatarUrl:       string | null
  isDev:           boolean
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

// ─── Toggle switch ────────────────────────────────────────────────────────────

function ToggleSwitch({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className="relative flex-shrink-0 h-6 w-11 transition-colors duration-200 disabled:opacity-40"
      style={{
        background:  enabled ? '#bf5fff' : '#1a1a2e',
        border:      '1px solid',
        borderColor: enabled ? '#bf5fff' : '#2a1545',
      }}
      aria-checked={enabled}
      role="switch"
    >
      <motion.span
        className="absolute top-1 w-4 h-4 bg-white pointer-events-none"
        animate={{ left: enabled ? 22 : 4 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </button>
  )
}

export function ProfileClient({ userId, userEmail, initialUsername, avatarUrl, isDev }: ProfileClientProps) {
  const router = useRouter()

  // ── Username ──────────────────────────────────────────────────────────────
  const [username, setUsername]       = useState(initialUsername)
  const [saving,   setSaving]         = useState(false)
  const [saveStatus, setSaveStatus]   = useState<'idle' | 'success' | 'error'>('idle')

  async function handleSaveUsername() {
    const trimmed = username.trim()
    if (!trimmed || trimmed === initialUsername || saving) return
    setSaving(true)
    setSaveStatus('idle')
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('profiles')
        .update({ username: trimmed })
        .eq('id', userId)
      if (error) throw error
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifSupported,  setNotifSupported]  = useState(false)
  const [notifPermission, setNotifPermission] = useState<PermissionState>('unsupported')
  const [enablingNotif,   setEnablingNotif]   = useState(false)
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
        .eq('user_id', userId)
        .maybeSingle()
      if (data) {
        setPrefs({
          notif_messages: data.notif_messages as boolean,
          notif_raids:    data.notif_raids    as boolean,
          notif_victory:  data.notif_victory  as boolean,
        })
      }
    } finally {
      setPrefsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    const supported = isSupported()
    const permission = getPermissionState()
    setNotifSupported(supported)
    setNotifPermission(permission)
    if (supported && permission === 'granted') fetchPrefs()
  }, [fetchPrefs])

  async function handleEnableNotifications() {
    setEnablingNotif(true)
    try {
      const state = await requestPermission()
      setNotifPermission(state)
      if (state === 'granted') {
        await subscribeToPush()
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
      await supabase
        .from('notification_preferences')
        .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    } finally {
      setSavingPref(null)
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await signOut()
      router.push('/login')
    } catch {
      setLoggingOut(false)
    }
  }

  const isDirty = username.trim() !== initialUsername && username.trim().length > 0

  return (
    <div className="min-h-screen bg-[#0a0612] flex flex-col">

      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 pb-3 border-b border-[#1a1a2e] flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center text-[#6b4f8f] hover:text-[#bf5fff] transition-colors flex-shrink-0"
          aria-label="Go back"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="font-pixel text-[11px] text-white">PROFILE</h1>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6 max-w-[480px] w-full mx-auto">

        {/* ── Avatar ── */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="relative overflow-hidden border-2 border-[#2a1545]"
            style={{ width: 80, height: 80 }}
          >
            {avatarUrl ? (
              <Image src={avatarUrl} alt={initialUsername} fill sizes="80px" className="object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center font-pixel text-[24px]"
                style={{ background: 'rgba(107,79,143,0.2)', color: '#6b4f8f' }}
              >
                {initialUsername[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </div>
          <p className="font-pixel text-[8px] text-[#3d2660]">
            {avatarUrl ? 'SYNCED FROM GOOGLE' : 'NO AVATAR'}
          </p>
        </div>

        {/* ── Username ── */}
        <section>
          <p className="font-pixel text-[9px] text-[#bf5fff] tracking-widest mb-3">USERNAME</p>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value); setSaveStatus('idle') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveUsername() }}
              maxLength={20}
              placeholder="your username"
              className="flex-1 bg-[#080514] border-2 border-[#2a1545] focus:border-[#bf5fff] focus:outline-none px-3 py-3 text-white text-sm font-sans placeholder:text-[#3a2555] transition-colors"
              style={{ fontSize: 16 }}
            />
            <motion.button
              onClick={handleSaveUsername}
              disabled={!isDirty || saving}
              whileTap={{ scale: 0.96 }}
              className="px-4 font-pixel text-[9px] transition-colors disabled:opacity-40"
              style={{
                background:  isDirty ? '#bf5fff' : 'rgba(191,95,255,0.1)',
                color:       isDirty ? '#0a0612' : '#6b4f8f',
                border:      '2px solid',
                borderColor: isDirty ? '#bf5fff' : '#2a1545',
              }}
            >
              {saving ? '...' : 'SAVE'}
            </motion.button>
          </div>
          {saveStatus === 'success' && (
            <p className="font-pixel text-[8px] text-[#66bb6a] mt-2">✓ SAVED</p>
          )}
          {saveStatus === 'error' && (
            <p className="font-pixel text-[8px] text-[#ff4444] mt-2">FAILED — TRY AGAIN</p>
          )}
        </section>

        {/* ── Notifications ── */}
        <section>
          <p className="font-pixel text-[9px] text-[#bf5fff] tracking-widest mb-3">NOTIFICATIONS</p>
          <div className="border border-[#1a1a2e]" style={{ background: 'rgba(15,8,32,0.6)' }}>
            {!notifSupported ? (
              <div className="p-4">
                <p className="font-pixel text-[8px] text-[#3d2660] leading-relaxed">
                  NOT SUPPORTED ON THIS DEVICE
                </p>
              </div>
            ) : notifPermission === 'denied' ? (
              <div className="p-4">
                <p className="font-pixel text-[8px] text-[#ff4444] mb-2">BLOCKED BY BROWSER</p>
                <p className="font-pixel text-[7px] text-[#3d2660] leading-relaxed">
                  ENABLE IN YOUR BROWSER SETTINGS TO RECEIVE NOTIFICATIONS
                </p>
              </div>
            ) : notifPermission !== 'granted' ? (
              <div className="p-4">
                <p className="font-pixel text-[8px] text-[#6b4f8f] mb-3 leading-relaxed">
                  GET NOTIFIED FOR MESSAGES, BOSS SPAWNS, AND VICTORIES
                </p>
                <button
                  onClick={handleEnableNotifications}
                  disabled={enablingNotif}
                  className="w-full h-10 font-pixel text-[9px] text-[#00e5ff] border border-[#00e5ff]/40 hover:border-[#00e5ff] transition-colors disabled:opacity-50"
                >
                  {enablingNotif ? '...' : '⚔ ENABLE NOTIFICATIONS'}
                </button>
              </div>
            ) : (
              // Granted — show individual toggles
              <div className={prefsLoading ? 'opacity-50 pointer-events-none' : ''}>
                {([
                  { key: 'notif_messages' as const, label: 'Messages',    sub: 'New messages from your crew' },
                  { key: 'notif_raids'    as const, label: 'Raid Alerts', sub: 'Boss spawns and expiry warnings' },
                  { key: 'notif_victory'  as const, label: 'Victory',     sub: 'Boss defeated, artifact dropped' },
                ] as const).map(({ key, label, sub }, i, arr) => (
                  <div
                    key={key}
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: i < arr.length - 1 ? '1px solid #1a1a2e' : 'none' }}
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="font-pixel text-[9px] text-white mb-0.5">{label}</p>
                      <p className="font-pixel text-[7px] text-[#3d2660] leading-relaxed">{sub}</p>
                    </div>
                    <ToggleSwitch
                      enabled={prefs[key]}
                      onChange={() => handleTogglePref(key)}
                      disabled={savingPref === key}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Account ── */}
        <section>
          <p className="font-pixel text-[9px] text-[#bf5fff] tracking-widest mb-3">ACCOUNT</p>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full h-12 font-pixel text-[9px] text-[#ff4444] border border-[#ff4444]/40 hover:border-[#ff4444] hover:bg-[#ff4444]/08 transition-colors disabled:opacity-50"
          >
            {loggingOut ? '...' : 'LOG OUT'}
          </button>
        </section>

        {/* ── Dev (only rendered server-side for the dev account) ── */}
        {isDev && <DevSection userId={userId} userEmail={userEmail} />}
      </div>
    </div>
  )
}

// ─── Dev section ──────────────────────────────────────────────────────────────

function DevSection({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [copiedId,    setCopiedId]    = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [flagsCleared, setFlagsCleared] = useState(false)

  function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  function clearLocalFlags() {
    const keys = [
      'nexus_first_message',
      'nexus_install_prompted',
      'nexus_crew_created',
      'nexus_notif_prompted',
      'nexus_notif_state',
    ]
    keys.forEach((k) => localStorage.removeItem(k))
    setFlagsCleared(true)
    setTimeout(() => setFlagsCleared(false), 2000)
  }

  return (
    <section>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <p className="font-pixel text-[9px] text-[#ffd700] tracking-widest">DEV</p>
        <span
          className="font-pixel text-[7px] text-[#0a0612] px-1.5 py-0.5"
          style={{ background: '#ffd700' }}
        >
          INTERNAL
        </span>
      </div>

      <div className="border border-[#ffd700]/20 divide-y divide-[#1a1a2e]" style={{ background: 'rgba(255,215,0,0.03)' }}>
        {/* User ID */}
        <div className="px-4 py-3">
          <p className="font-pixel text-[7px] text-[#6b4f8f] mb-1.5">USER ID</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-sans text-[11px] text-[#ffd700] truncate select-all">
              {userId}
            </code>
            <button
              onClick={() => copyToClipboard(userId, setCopiedId)}
              className="flex-shrink-0 font-pixel text-[7px] px-2 py-1 border transition-colors"
              style={{
                color:       copiedId ? '#66bb6a' : '#ffd700',
                borderColor: copiedId ? 'rgba(102,187,106,0.4)' : 'rgba(255,215,0,0.3)',
                background:  copiedId ? 'rgba(102,187,106,0.08)' : 'rgba(255,215,0,0.06)',
              }}
            >
              {copiedId ? '✓' : 'COPY'}
            </button>
          </div>
        </div>

        {/* Email */}
        <div className="px-4 py-3">
          <p className="font-pixel text-[7px] text-[#6b4f8f] mb-1.5">EMAIL</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-sans text-[11px] text-[#ffd700] truncate select-all">
              {userEmail}
            </code>
            <button
              onClick={() => copyToClipboard(userEmail, setCopiedEmail)}
              className="flex-shrink-0 font-pixel text-[7px] px-2 py-1 border transition-colors"
              style={{
                color:       copiedEmail ? '#66bb6a' : '#ffd700',
                borderColor: copiedEmail ? 'rgba(102,187,106,0.4)' : 'rgba(255,215,0,0.3)',
                background:  copiedEmail ? 'rgba(102,187,106,0.08)' : 'rgba(255,215,0,0.06)',
              }}
            >
              {copiedEmail ? '✓' : 'COPY'}
            </button>
          </div>
        </div>

        {/* Reset localStorage flags */}
        <div className="px-4 py-3">
          <p className="font-pixel text-[7px] text-[#6b4f8f] mb-1.5">LOCAL FLAGS</p>
          <p className="font-pixel text-[7px] text-[#3d2660] mb-2 leading-relaxed">
            Clears install prompt, notification prompt, and first-message flags — useful for retesting onboarding flows.
          </p>
          <button
            onClick={clearLocalFlags}
            className="w-full h-9 font-pixel text-[8px] border transition-colors"
            style={{
              color:       flagsCleared ? '#66bb6a' : '#ffd700',
              borderColor: flagsCleared ? 'rgba(102,187,106,0.4)' : 'rgba(255,215,0,0.3)',
              background:  flagsCleared ? 'rgba(102,187,106,0.08)' : 'rgba(255,215,0,0.06)',
            }}
          >
            {flagsCleared ? '✓ CLEARED' : 'RESET FLAGS'}
          </button>
        </div>
      </div>
    </section>
  )
}
