'use client'

import { useState, useEffect } from 'react'
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
  initialUsername: string
  avatarUrl:       string | null
}

export function ProfileClient({ userId, initialUsername, avatarUrl }: ProfileClientProps) {
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

  useEffect(() => {
    setNotifSupported(isSupported())
    setNotifPermission(getPermissionState())
  }, [])

  async function handleEnableNotifications() {
    setEnablingNotif(true)
    try {
      const state = await requestPermission()
      setNotifPermission(state)
      if (state === 'granted') await subscribeToPush()
    } finally {
      setEnablingNotif(false)
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
          <p className="font-pixel text-[9px] text-[#bf5fff] tracking-widest mb-3">RAID ALERTS</p>
          <div className="border border-[#1a1a2e] p-4" style={{ background: 'rgba(15,8,32,0.6)' }}>
            {!notifSupported ? (
              <p className="font-pixel text-[8px] text-[#3d2660] leading-relaxed">
                NOT SUPPORTED ON THIS DEVICE
              </p>
            ) : notifPermission === 'granted' ? (
              <div className="flex items-center justify-between">
                <p className="font-pixel text-[8px] text-[#66bb6a]">✓ NOTIFICATIONS ENABLED</p>
                <span
                  className="font-pixel text-[7px] text-[#66bb6a] border border-[#66bb6a]/40 px-2 py-0.5"
                  style={{ background: 'rgba(102,187,106,0.08)' }}
                >
                  ACTIVE
                </span>
              </div>
            ) : notifPermission === 'denied' ? (
              <div>
                <p className="font-pixel text-[8px] text-[#ff4444] mb-2">BLOCKED BY BROWSER</p>
                <p className="font-pixel text-[7px] text-[#3d2660] leading-relaxed">
                  ENABLE IN YOUR BROWSER SETTINGS TO RECEIVE RAID ALERTS
                </p>
              </div>
            ) : (
              <div>
                <p className="font-pixel text-[8px] text-[#6b4f8f] mb-3 leading-relaxed">
                  GET NOTIFIED WHEN A BOSS SPAWNS OR YOUR CREW NEEDS YOU
                </p>
                <button
                  onClick={handleEnableNotifications}
                  disabled={enablingNotif}
                  className="w-full h-10 font-pixel text-[9px] text-[#00e5ff] border border-[#00e5ff]/40 hover:border-[#00e5ff] hover:bg-[#00e5ff]/06 transition-colors disabled:opacity-50"
                >
                  {enablingNotif ? '...' : '⚔ ENABLE RAID ALERTS'}
                </button>
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
      </div>
    </div>
  )
}
