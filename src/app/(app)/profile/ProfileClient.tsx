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
import { revalidateProfileAction } from './actions'

interface ProfileClientProps {
  userId:          string
  userEmail:       string
  initialUsername: string
  avatarUrl:       string | null
  isDev:           boolean
  isGuest:         boolean
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

export function ProfileClient({ userId, userEmail, initialUsername, avatarUrl, isDev, isGuest }: ProfileClientProps) {
  const router = useRouter()

  // ── Username ──────────────────────────────────────────────────────────────
  const [username, setUsername]       = useState(initialUsername)
  const [saving,     setSaving]     = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error' | 'taken'>('idle')

  async function handleSaveUsername() {
    const trimmed = username.trim()
    if (!trimmed || trimmed === initialUsername || saving) return
    if (trimmed.length < 3) { setSaveStatus('error'); return }

    setSaving(true)
    setSaveStatus('idle')
    try {
      const supabase = createClient()

      // Pre-check: case-insensitive uniqueness check before hitting the DB constraint
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', trimmed)
        .neq('id', userId)
        .maybeSingle()

      if (existing) {
        setSaveStatus('taken')
        return
      }

      const { error } = await supabase
        .from('profiles')
        .update({ username: trimmed })
        .eq('id', userId)

      // Catch unique constraint violation (race condition fallback, code 23505)
      if (error) {
        if (error.code === '23505') { setSaveStatus('taken'); return }
        throw error
      }

      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
      revalidateProfileAction()
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
    setSubError(false)
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
          {isGuest ? (
            // Guests cannot change their username until they log in with Google
            <div>
              <div
                className="w-full bg-[#080514] border-2 border-[#2a1545] px-3 py-3 opacity-50 cursor-not-allowed select-none"
              >
                <span className="text-white text-sm font-sans">{initialUsername}</span>
              </div>
              <p className="font-pixel text-[7px] text-[#6b4f8f] mt-2 leading-relaxed">
                SIGN IN WITH GOOGLE TO UPDATE YOUR USERNAME
              </p>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setSaveStatus('idle') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveUsername() }}
                  minLength={3}
                  maxLength={20}
                  placeholder="your username"
                  className="flex-1 bg-[#080514] border-2 border-[#2a1545] focus:border-[#bf5fff] focus:outline-none px-3 py-3 text-white text-sm font-sans placeholder:text-[#3a2555] transition-colors"
                  style={{
                    fontSize:    16,
                    borderColor: saveStatus === 'taken' ? '#ff4444' : undefined,
                  }}
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
              {saveStatus === 'taken' && (
                <p className="font-pixel text-[8px] text-[#ff4444] mt-2">USERNAME TAKEN — PICK ANOTHER</p>
              )}
              {saveStatus === 'error' && (
                <p className="font-pixel text-[8px] text-[#ff4444] mt-2">FAILED — TRY AGAIN</p>
              )}
            </div>
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
                  {enablingNotif ? '...' : subError ? '↺ RETRY' : '⚔ ENABLE NOTIFICATIONS'}
                </button>
                {subError && (
                  <p className="font-pixel text-[7px] text-[#ff9944] mt-2 leading-relaxed">
                    SUBSCRIPTION FAILED — ENSURE THIS APP IS ADDED TO YOUR HOME SCREEN, THEN RETRY
                  </p>
                )}
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

type PushStatus = {
  sw_subscription: 'none' | 'apns' | 'fcm' | 'unknown'
  subs_in_db: number
  endpoints: { id: string; endpoint_preview: string; is_apns: boolean; created_at: string }[]
  error?: string
}

function DevSection({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [copiedId,    setCopiedId]    = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [flagsCleared, setFlagsCleared] = useState(false)
  const [devMode, setDevMode] = useState(false)

  const [pushStatus,  setPushStatus]  = useState<PushStatus | null>(null)
  const [pushLoading, setPushLoading] = useState(false)
  const [testResult,  setTestResult]  = useState<string | null>(null)
  const [syncResult,  setSyncResult]  = useState<string | null>(null)

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
  }, [])

  function toggleDevMode() {
    const next = !devMode
    setDevMode(next)
    if (next) localStorage.setItem('nexus_dev_mode', '1')
    else localStorage.removeItem('nexus_dev_mode')
  }

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

  async function getAuthToken(): Promise<string | null> {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function checkPushStatus() {
    setPushLoading(true)
    setPushStatus(null)
    try {
      // Client-side SW subscription check
      let swSub: 'none' | 'apns' | 'fcm' | 'unknown' = 'none'
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          const ep = sub.endpoint
          swSub = ep.includes('web.push.apple.com') ? 'apns'
                : ep.includes('fcm.googleapis.com') ? 'fcm'
                : 'unknown'
        }
      }

      // Server-side DB check
      const token = await getAuthToken()
      if (!token) { setPushStatus({ sw_subscription: swSub, subs_in_db: 0, endpoints: [], error: 'No session' }); return }

      const res = await fetch('/api/test/push', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setPushStatus({ sw_subscription: swSub, ...data })
    } catch (err) {
      setPushStatus({ sw_subscription: 'none', subs_in_db: 0, endpoints: [], error: String(err) })
    } finally {
      setPushLoading(false)
    }
  }

  async function syncSubscription() {
    setSyncResult(null)
    try {
      const sub = await subscribeToPush()
      setSyncResult(sub ? `✓ Synced — ${sub.endpoint.slice(0, 40)}...` : '✗ subscribeToPush returned null')
    } catch (err) {
      setSyncResult(`✗ ${String(err)}`)
    }
  }

  async function sendTestNotification() {
    setTestResult(null)
    try {
      const token = await getAuthToken()
      if (!token) { setTestResult('✗ No session'); return }
      const res  = await fetch('/api/test/push', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json() as {
        error?: string
        fn_status?: number
        fn_ok?: boolean
        result?: unknown
      }

      // Route-level error (env vars missing, auth failed, etc.)
      if (data.error) { setTestResult(`✗ Route: ${data.error}`); return }

      // send-notification response
      const result = data.result as Record<string, unknown> | undefined
      if (result?.status === 'no_subscriptions') {
        setTestResult('✗ No subscriptions in DB — tap SYNC SUB first')
      } else if (result?.status === 'preference_disabled') {
        setTestResult('✗ Message notifications disabled in your preferences')
      } else if (Array.isArray(result?.results) && (result.results as {status:string}[]).some(r => r.status === 'sent')) {
        setTestResult('✓ Sent — check your notification tray')
      } else {
        // Show everything for diagnosis
        setTestResult(`fn_status=${data.fn_status} | ${JSON.stringify(result ?? data)}`)
      }
    } catch (err) {
      setTestResult(`✗ ${String(err)}`)
    }
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
        {/* Spawn boss mode */}
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-pixel text-[7px] text-[#6b4f8f] mb-1">SPAWN BOSS MODE</p>
            <p className="font-pixel text-[7px] text-[#3d2660] leading-relaxed">
              Shows boss spawn button in chat for testing
            </p>
          </div>
          <ToggleSwitch enabled={devMode} onChange={toggleDevMode} />
        </div>

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

        {/* Push diagnostics */}
        <div className="px-4 py-3">
          <p className="font-pixel text-[7px] text-[#6b4f8f] mb-2">PUSH DIAGNOSTICS</p>
          <div className="flex gap-2 mb-2">
            <button
              onClick={checkPushStatus}
              disabled={pushLoading}
              className="flex-1 h-8 font-pixel text-[7px] border transition-colors disabled:opacity-50"
              style={{ color: '#ffd700', borderColor: 'rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.06)' }}
            >
              {pushLoading ? '...' : 'CHECK STATUS'}
            </button>
            <button
              onClick={syncSubscription}
              className="flex-1 h-8 font-pixel text-[7px] border transition-colors"
              style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.06)' }}
            >
              SYNC SUB
            </button>
            <button
              onClick={sendTestNotification}
              className="flex-1 h-8 font-pixel text-[7px] border transition-colors"
              style={{ color: '#bf5fff', borderColor: 'rgba(191,95,255,0.3)', background: 'rgba(191,95,255,0.06)' }}
            >
              SEND TEST
            </button>
          </div>
          {pushStatus && (
            <div className="font-sans text-[10px] text-[#ffd700] space-y-0.5 bg-black/30 p-2">
              <p>SW sub: <span className="text-white">{pushStatus.sw_subscription}</span></p>
              <p>DB subs: <span className="text-white">{pushStatus.subs_in_db}</span></p>
              {pushStatus.endpoints.map((ep) => (
                <p key={ep.id} className="truncate text-[#6b4f8f]">
                  {ep.is_apns ? '🍎' : '🤖'} {ep.endpoint_preview}
                </p>
              ))}
              {pushStatus.error && <p className="text-[#ff4444]">{pushStatus.error}</p>}
            </div>
          )}
          {syncResult  && <p className="font-sans text-[10px] text-[#00e5ff] mt-1">{syncResult}</p>}
          {testResult  && <p className="font-sans text-[10px] text-[#bf5fff] mt-1">{testResult}</p>}
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
