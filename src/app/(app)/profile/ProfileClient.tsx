'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
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
  avatarClass:     string | null
  isDev:           boolean
  isGuest:         boolean
  memberSinceYear: string
  totalMessages:   number
  groupChats:      number
  inviterUsername: string | null
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
      className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal"
      style={{ fontVariationSettings: '"opsz" 14' }}
    >
      {children}
    </p>
  )
}

// ─── Toggle switch — matches Figma: 40px wide, square thumb, purple when on ──

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

// ─── Notification row ─────────────────────────────────────────────────────────

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
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
          <p
            className="font-body font-medium text-[14px] text-secondary leading-normal"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            {label}
          </p>
          <p
            className="font-body font-normal text-[12px] text-tertiary leading-normal"
            style={{ fontVariationSettings: '"opsz" 14' }}
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

// ─── ProfileClient ────────────────────────────────────────────────────────────

export function ProfileClient({
  userId, userEmail, initialUsername, avatarUrl, avatarClass, isDev, isGuest,
  memberSinceYear, totalMessages, groupChats, inviterUsername,
}: ProfileClientProps) {
  const router = useRouter()
  const goBack = useSlideBack()

  // ── Username ──────────────────────────────────────────────────────────────
  const [username,   setUsername]   = useState(initialUsername)
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
      const { data: existing } = await supabase
        .from('profiles').select('id').ilike('username', trimmed).neq('id', userId).maybeSingle()
      if (existing) { setSaveStatus('taken'); return }

      const { error } = await supabase.from('profiles').update({ username: trimmed }).eq('id', userId)
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

  const isDirty = username.trim() !== initialUsername && username.trim().length > 0
  const initial = initialUsername[0]?.toUpperCase() ?? '?'
  const msgFormatted   = totalMessages.toLocaleString()
  const notifRows = [
    { key: 'notif_messages' as const, label: 'Messages',    sub: 'Notify me with new messages from this chat' },
    { key: 'notif_raids'    as const, label: 'Raid Alerts', sub: 'Notify me when boss spawns and expires' },
    { key: 'notif_victory'  as const, label: 'Victory',     sub: 'Notify me when boss defeated & artifact drops' },
  ]

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* ── Header ── */}
      <div
        className="px-4 border-b border-border flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)', paddingBottom: 8 }}
      >
        <div className="flex items-center h-[40px] gap-2">
          <button
            onClick={goBack}
            aria-label="Back"
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: 24, height: 40 }}
          >
            <i className="hn hn-angle-left-solid" style={{ fontSize: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
          </button>
          <h1 className="font-pixel text-[18px] text-primary leading-none">PROFILE</h1>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6 nexus-scroll">

        {/* Details row */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0 w-14 h-14 bg-primary overflow-hidden">
            {avatarUrl ? (
              <Image src={avatarUrl} alt={initialUsername} fill sizes="56px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-surface">
                <span className="font-pixel text-[14px] text-purple">{initial}</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {memberSinceYear && (
              <p className="font-silkscreen text-[8px] text-tertiary leading-none">
                Member Since {memberSinceYear}
              </p>
            )}
            <p
              className="font-body font-bold text-[18px] text-primary leading-none truncate"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              {initialUsername}
            </p>
            <p className="font-silkscreen text-[8px] text-secondary leading-none">
              {groupChats} group chat{groupChats !== 1 ? 's' : ''} · {msgFormatted} msg
            </p>
            {inviterUsername && (
              <p className="font-silkscreen text-[8px] text-tertiary leading-none">
                Recruited by {inviterUsername}
              </p>
            )}
          </div>
        </div>

        {/* Account */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <SectionLabel>Account</SectionLabel>
            <p
              className="font-body font-normal text-[12px] tracking-[0.2px] leading-normal"
              style={{ color: '#9a9a9a', fontVariationSettings: '"opsz" 14' }}
            >
              {'Signed in with '}
              <span className="text-primary">{userEmail}</span>
            </p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full h-12 border border-[#ef4444] flex items-center justify-center transition-colors hover:bg-[#ef4444]/8 disabled:opacity-50"
          >
            <span className="font-pixel text-[11px] text-[#ef4444] leading-none whitespace-nowrap">
              {loggingOut ? '...' : 'LOG OUT'}
            </span>
          </button>
        </div>

        {/* Username */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Username</SectionLabel>
          {isGuest ? (
            <div>
              <div className="w-full bg-surface border border-[rgba(168,85,247,0.5)] h-12 flex items-center px-3 opacity-50 cursor-not-allowed">
                <span
                  className="font-body font-normal text-[14px] text-secondary leading-normal"
                  style={{ fontVariationSettings: '"opsz" 14' }}
                >
                  {initialUsername}
                </span>
              </div>
              <p className="font-pixel text-[7px] text-muted mt-2 leading-relaxed">
                SIGN IN WITH GOOGLE TO UPDATE YOUR USERNAME
              </p>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <div className="flex-1 bg-surface border border-[rgba(168,85,247,0.5)] h-12 flex items-center px-3 overflow-hidden"
                  style={{ borderColor: saveStatus === 'taken' ? '#ef4444' : undefined }}
                >
                  <input
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setSaveStatus('idle') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveUsername() }}
                    minLength={3}
                    maxLength={20}
                    placeholder="your username"
                    className="flex-1 bg-transparent font-body font-normal text-[14px] text-secondary placeholder:text-muted focus:outline-none leading-normal"
                    style={{ fontVariationSettings: '"opsz" 14', fontSize: 16 }}
                  />
                </div>
                <button
                  onClick={handleSaveUsername}
                  disabled={!isDirty || saving}
                  className="bg-purple self-stretch px-4 flex items-center justify-center transition-opacity disabled:opacity-40"
                >
                  <span className="font-pixel text-[8px] text-primary leading-none whitespace-nowrap">
                    {saving ? '...' : 'SAVE'}
                  </span>
                </button>
              </div>
              {saveStatus === 'success' && (
                <p className="font-pixel text-[8px] text-[#66bb6a] mt-2">✓ SAVED</p>
              )}
              {saveStatus === 'taken' && (
                <p className="font-pixel text-[8px] text-[#ef4444] mt-2">USERNAME TAKEN — PICK ANOTHER</p>
              )}
              {saveStatus === 'error' && (
                <p className="font-pixel text-[8px] text-[#ef4444] mt-2">FAILED — TRY AGAIN</p>
              )}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Notifications</SectionLabel>
          <div className="bg-surface border border-[rgba(168,85,247,0.5)] overflow-hidden py-4">
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
                <p className="font-body font-normal text-[12px] text-tertiary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>
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
              <div className={prefsLoading ? 'opacity-50 pointer-events-none' : ''}>
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

        {/* Dev */}
        {isDev && <DevSection userId={userId} userEmail={userEmail} />}

        <div style={{ height: 'max(env(safe-area-inset-bottom), 16px)' }} />
      </div>
    </SlidePage>
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
  const [copiedId,     setCopiedId]     = useState(false)
  const [copiedEmail,  setCopiedEmail]  = useState(false)
  const [flagsCleared, setFlagsCleared] = useState(false)
  const [devMode,      setDevMode]      = useState(false)
  const [showPush,     setShowPush]     = useState(false)
  const [infiniteCoins, setInfiniteCoins] = useState(false)
  const [actualCoins,  setActualCoins]  = useState<number | null>(null)

  const [pushStatus,  setPushStatus]  = useState<PushStatus | null>(null)
  const [pushLoading, setPushLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [testResult,  setTestResult]  = useState<string | null>(null)
  const [syncResult,  setSyncResult]  = useState<string | null>(null)
  const [lastSwPush,  setLastSwPush]  = useState<number | null>(null)

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
    setShowPush(localStorage.getItem('nexus_push_diag') === '1')
    setInfiniteCoins(localStorage.getItem('nexus_infinite_coins') === '1')
    // fetch actual coin balance
    const supabase = createClient()
    supabase.from('profiles').select('coins').eq('id', userId).maybeSingle().then(({ data }) => {
      if (data) setActualCoins((data as { coins: number }).coins)
    })
  }, [userId])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    function onSwMessage(ev: MessageEvent) {
      if (ev.data?.type === 'nexus-push-received') setLastSwPush(ev.data.ts as number)
    }
    navigator.serviceWorker.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage)
  }, [])

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
  }

  function toggleInfiniteCoins() {
    const next = !infiniteCoins
    setInfiniteCoins(next)
    if (next) localStorage.setItem('nexus_infinite_coins', '1')
    else localStorage.removeItem('nexus_infinite_coins')
    window.dispatchEvent(new CustomEvent('nexus-infinite-coins-change', { detail: { on: next } }))
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

  async function getAuthToken(): Promise<string | null> {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function checkPushStatus() {
    setPushLoading(true); setPushStatus(null)
    try {
      let swSub: 'none' | 'apns' | 'fcm' | 'unknown' = 'none'
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          const ep = sub.endpoint
          swSub = ep.includes('web.push.apple.com') ? 'apns' : ep.includes('fcm.googleapis.com') ? 'fcm' : 'unknown'
        }
      }
      const token = await getAuthToken()
      if (!token) { setPushStatus({ sw_subscription: swSub, subs_in_db: 0, endpoints: [], error: 'No session' }); return }
      const res  = await fetch('/api/test/push', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setPushStatus({ sw_subscription: swSub, ...data })
    } catch (err) {
      setPushStatus({ sw_subscription: 'none', subs_in_db: 0, endpoints: [], error: String(err) })
    } finally {
      setPushLoading(false)
    }
  }

  async function syncSubscription() {
    setSyncLoading(true)
    const show = (msg: string) => setSyncResult(msg)
    try {
      show(`1/6 supported=${!!('PushManager' in window)} perm=${Notification.permission}`)
      const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
        Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms))])
      let regs = await navigator.serviceWorker.getRegistrations()
      if (regs.length === 0) {
        show('2/6 regs=0 — attempting register /sw-push.js...')
        try {
          await navigator.serviceWorker.register('/sw-push.js', { scope: '/' })
          await withTimeout(navigator.serviceWorker.ready, 8000, 'sw.activate')
          regs = await navigator.serviceWorker.getRegistrations()
        } catch (regErr) { show(`2/6 register FAILED: ${String(regErr).slice(0, 120)}`); return }
      }
      const reg = regs[0]
      show(`2/6 regs=${regs.length} scope=${reg?.scope ?? 'NONE'} active=${reg?.active?.state ?? 'none'}`)
      if (!reg) return
      const existing = await withTimeout(reg.pushManager.getSubscription(), 5000, 'getSubscription')
      show(`3/6 existing=${existing ? 'yes' : 'none'}`)
      let sub = existing
      if (!sub) {
        show('4/6 subscribing...')
        const padding = '='.repeat((4 - (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.length % 4)) % 4)
        const base64  = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY! + padding).replace(/-/g, '+').replace(/_/g, '/')
        const raw = window.atob(base64)
        const bytes = new Uint8Array(new ArrayBuffer(raw.length))
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
        sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }), 10000, 'subscribe')
        show('4/6 new sub created')
      } else { show('4/6 using existing sub') }
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      show(`5/6 uid=${session?.user?.id?.slice(0, 8) ?? 'NO SESSION'}`)
      if (!session?.user) return
      const json = sub.toJSON()
      const p256dh = json.keys?.p256dh; const auth = json.keys?.auth
      if (!p256dh || !auth) { show('5/6 keys=MISSING'); return }
      await supabase.from('push_subscriptions').delete().match({ endpoint: sub.endpoint, user_id: session.user.id })
      const { error } = await supabase.from('push_subscriptions').insert({ user_id: session.user.id, endpoint: sub.endpoint, p256dh, auth })
      show(error ? `6/6 insert FAILED: ${error.message}` : '6/6 insert=OK — done!')
    } catch (err) {
      show(`STOPPED: ${String(err).slice(0, 120)}`)
    } finally {
      setSyncLoading(false)
    }
  }

  async function sendTestNotification() {
    setTestResult(null)
    try {
      const token = await getAuthToken()
      if (!token) { setTestResult('✗ No session'); return }
      const res  = await fetch('/api/test/push', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json() as { error?: string; fn_status?: number; fn_ok?: boolean; result?: unknown }
      if (data.error) { setTestResult(`✗ Route: ${data.error}`); return }
      const result = data.result as Record<string, unknown> | undefined
      if (result?.status === 'no_subscriptions') setTestResult('✗ No subscriptions in DB — tap SYNC SUB first')
      else if (result?.status === 'preference_disabled') setTestResult('✗ Message notifications disabled')
      else if (Array.isArray(result?.results) && (result.results as {status:string}[]).some(r => r.status === 'sent')) setTestResult('✓ Sent — check your notification tray')
      else setTestResult(`fn_status=${data.fn_status} | ${JSON.stringify(result ?? data)}`)
    } catch (err) {
      setTestResult(`✗ ${String(err)}`)
    }
  }

  const rowClass = 'flex items-center justify-between px-4 py-4 gap-4'
  const labelClass = 'font-body font-medium text-[14px] tracking-[0.2px] leading-normal'

  return (
    <div className="flex flex-col gap-2">
      <p
        className={labelClass}
        style={{ color: '#ffd700', fontVariationSettings: '"opsz" 14' }}
      >
        Dev
      </p>
      <div className="bg-surface border border-[rgba(255,215,0,0.25)] overflow-hidden divide-y divide-border">

        {/* Spawn boss mode */}
        <div className={rowClass}>
          <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
            <p className="font-body font-medium text-[14px] text-secondary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Spawn Boss Mode</p>
            <p className="font-body font-normal text-[12px] text-tertiary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Shows boss spawn button in chat for testing</p>
          </div>
          <ToggleSwitch enabled={devMode} onChange={toggleDevMode} />
        </div>

        {/* Push diagnostics toggle */}
        <div className={rowClass}>
          <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
            <p className="font-body font-medium text-[14px] text-secondary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Push Diagnostics</p>
            <p className="font-body font-normal text-[12px] text-tertiary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Show push subscription tools below</p>
          </div>
          <ToggleSwitch enabled={showPush} onChange={toggleShowPush} />
        </div>

        {/* Infinite coins toggle */}
        <div className={rowClass}>
          <div className="flex-1 min-w-0 flex flex-col gap-0 leading-[0] tracking-[0.2px]">
            <p className="font-body font-medium text-[14px] text-secondary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>Infinite Coins</p>
            <p className="font-body font-normal text-[12px] text-tertiary leading-normal" style={{ fontVariationSettings: '"opsz" 14' }}>
              {infiniteCoins
                ? 'Unlimited coins (testing only)'
                : `Balance: ${actualCoins === null ? '...' : actualCoins.toLocaleString()} coins`}
            </p>
          </div>
          <ToggleSwitch enabled={infiniteCoins} onChange={toggleInfiniteCoins} />
        </div>

        {/* User ID */}
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

        {/* Email */}
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

        {/* Push diagnostics — only shown when toggle is on */}
        {showPush && (
          <div className="px-4 py-4 flex flex-col gap-2">
            <div className="flex gap-2">
              <button onClick={checkPushStatus} disabled={pushLoading} className="flex-1 h-9 font-pixel text-[7px] border transition-colors disabled:opacity-50"
                style={{ color: '#ffd700', borderColor: 'rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.06)' }}>
                {pushLoading ? '...' : 'CHECK'}
              </button>
              <button onClick={syncSubscription} disabled={syncLoading} className="flex-1 h-9 font-pixel text-[7px] border transition-colors disabled:opacity-50"
                style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.06)' }}>
                {syncLoading ? '...' : 'SYNC SUB'}
              </button>
              <button onClick={sendTestNotification} className="flex-1 h-9 font-pixel text-[7px] border transition-colors"
                style={{ color: '#a855f7', borderColor: 'rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.06)' }}>
                SEND TEST
              </button>
            </div>
            {pushStatus && (
              <div className="font-sans text-[10px] text-[#ffd700] space-y-0.5 bg-black/30 p-2">
                <p>SW sub: <span className="text-white">{pushStatus.sw_subscription}</span></p>
                <p>DB subs: <span className="text-white">{pushStatus.subs_in_db}</span></p>
                {pushStatus.endpoints.map((ep) => (
                  <p key={ep.id} className="truncate text-tertiary">{ep.is_apns ? '🍎' : '🤖'} {ep.endpoint_preview}</p>
                ))}
                {pushStatus.error && <p className="text-[#ef4444]">{pushStatus.error}</p>}
              </div>
            )}
            {syncResult && <p className="font-sans text-[11px] text-[#00e5ff] break-all leading-relaxed bg-black/30 p-2">{syncResult}</p>}
            {testResult && <p className="font-sans text-[11px] text-purple break-all leading-relaxed bg-black/30 p-2">{testResult}</p>}
            <p className="font-sans text-[10px] text-[#ffd700]">
              SW push event: <span className="text-white">{lastSwPush ? `fired at ${new Date(lastSwPush).toLocaleTimeString()}` : 'not yet received'}</span>
            </p>
          </div>
        )}

        {/* Reset flags */}
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

      </div>
    </div>
  )
}
