'use client'

import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import Image from 'next/image'
import { supabaseImageLoader, avatarImageLoader } from '@/shared/supabase/imageLoader'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/shared/supabase/client'
import { getXPProgress, getXPInCurrentLevel, getXPForCurrentLevel } from '@/shared/utils/xp'
import { useChatStore } from '@/store/chatStore'
import { FriendshipXPToast } from '@/shared/components/game/FriendshipXPToast'
import { GemToast } from '@/shared/components/game/GemToast'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/shared/constants/config'
import { haptic } from '@/shared/utils/sounds'
import { compressImage, generateLQIP, validateImageUpload, getNetworkQuality } from '@/shared/utils/imageProcessing'
import { IMAGE_CONFIG } from '@/shared/constants/config'
import { isGemGateOpen, recordGemClaim } from '@/shared/utils/gems'
import type { GemClaimResult } from '@/types'
import { Send } from 'pixelarticons/react/Send'
import { Attachment } from 'pixelarticons/react/Attachment'
import { Chart } from 'pixelarticons/react/Chart'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { Undo } from 'pixelarticons/react/Undo'
import { Close } from 'pixelarticons/react/Close'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { GifIcon } from '@/shared/icons/GifIcon'
import { kickMemberAction, renameCrewAction, birthdaysCommandAction, updateCrewBackgroundImageAction } from '@/app/(app)/chat/actions'
import { leaveCrewAction } from '@/app/(app)/home/actions'
import { resizeImageToBlob } from '@/shared/utils/imageCompress'
import { EventCreationSheet } from '@/features/events/components/EventCreationSheet'
import { CrewImageUploadModal } from '@/features/chat/components/sheets/CrewImageUploadModal'
import { NotifSheet, type NotifPrefs } from '@/features/chat/components/sheets/NotifSheet'
import { SquadDetailsSheet, type MiniMember } from '@/features/chat/components/sheets/SquadDetailsSheet'
import { PollCreatorSheet } from '@/features/chat/components/polls/PollCreatorSheet'
import { GifPickerSheet } from '@/features/chat/components/input/GifPickerSheet'
import { setHomeLastMessage } from '@/features/home/utils/homePreviewCache'
import { useCombatStore } from '@/store/combatStore'
import { DamageFloatLayer } from '@/features/combat/components/DamageFloat'
import type { Message, MessageWithProfile, Profile, ActiveRaid, CombatMember, CombatClass } from '@/types'

const MAX_MESSAGE_LENGTH   = 2000
const RATE_LIMIT_MAX       = 30
const RATE_LIMIT_WINDOW    = 60_000
const ONLINE_THRESHOLD_MS  = 45_000

const CREW_AVATAR_COLORS = ['#bf5fff', '#00e5ff', '#ffd700', '#ff4444', '#66bb6a', '#ff9800']

const SLASH_COMMANDS = [
  { name: 'birthdays', icon: '🎂', description: 'See upcoming squad birthdays' },
  { name: 'event',     icon: '📅', description: 'Create a group event' },
] as const
type SlashCommandName = typeof SLASH_COMMANDS[number]['name']


type MemberProfile = Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'>

interface PendingImage {
  id:        string
  localUrl:  string        // blob URL — shown immediately on selection
  publicUrl: string | null // set after upload completes
  lqip:      string | null // set after LQIP generation
  uploading: boolean
  error:     string | null
}

interface ChatInputProps {
  crewId:         string
  userId:         string
  userProfile:    MemberProfile
  memberProfiles: Record<string, MemberProfile>
  crewName:       string
  inviteCode?:    string
  creatorId?:     string
  crewImageUrl?:           string | null
  crewBackgroundImageUrl?: string | null
  initialXP?:              number
  currentUserId?:      string
  isDM?:               boolean
  dmPartnerId?:        string
  userCombatClass?:    CombatClass | null
  initialRaid?:        ActiveRaid | null
  initialMemberStats?: Record<string, CombatMember>
  initialReviveTokens?: number
}

function sanitizeMessage(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, MAX_MESSAGE_LENGTH)
}

// Fire-and-forget daily gem claim. The local gate (idb-keyval) is a debounce only —
// the award-gem Edge Function + claim_daily_gem RPC are the sole authority on the
// award decision. Must never block sending or surface errors as a send failure.
async function tryClaimDailyGem(supabase: ReturnType<typeof createClient>, onClaimed?: () => void) {
  try {
    if (!(await isGemGateOpen())) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return

    const res = await fetch(`${SUPABASE_URL}/functions/v1/award-gem`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body:    JSON.stringify({ timezone_offset_minutes: new Date().getTimezoneOffset() }),
    })
    const data: GemClaimResult = await res.json()
    if (data.claimed) {
      await recordGemClaim()
      useChatStore.getState().setGemBalance(data.gem_balance)
      onClaimed?.()
    }
  } catch {
    // Silent — a failed gem claim must never surface as a message send error.
  }
}


// ─── ChatSquadDetailBar ───────────────────────────────────────────────────────

interface ChatSquadDetailBarProps {
  crewImageUrl:     string | null | undefined
  crewName:         string
  crewLevel:        number
  members:          MemberProfile[]
  onlineUserIds:    Set<string>
  combatEnabled:    boolean
  hasJoinedRaid:    boolean
  activeCombatRaid: ActiveRaid | null
  crewXP:           number
  xpProgress:       number
  totalMessages:    number
  onExpand:         () => void
  onPanEnd:         (_: PointerEvent, info: PanInfo) => void
}

function ChatSquadDetailBar({
  crewImageUrl, crewName, crewLevel, members, onlineUserIds,
  combatEnabled, hasJoinedRaid, activeCombatRaid,
  crewXP, xpProgress, totalMessages,
  onExpand, onPanEnd,
}: ChatSquadDetailBarProps) {
  const sortedMembers = [...members]
    .sort((a, b) => (onlineUserIds.has(b.id) ? 1 : 0) - (onlineUserIds.has(a.id) ? 1 : 0))
    .slice(0, 5)

  return (
    <motion.div
      className="flex flex-col relative cursor-pointer"
      style={{ touchAction: 'pan-x', gap: 'var(--space-5)' }}
      onPanEnd={onPanEnd}
      onClick={onExpand}
    >
      {/* Crew image + name/level | dot | member avatars */}
      <div className="flex items-center" style={{ gap: 'var(--space-5)' }}>
        <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>
          <div className="relative flex-shrink-0 overflow-hidden bg-surface" style={{ width: 24, height: 24 }}>
            {crewImageUrl && (
              <Image src={crewImageUrl} alt={crewName} fill sizes="24px" className="object-cover" loader={supabaseImageLoader} />
            )}
          </div>
          <div className="flex flex-col" style={{ gap: 2 }}>
            <p className="font-body font-black text-secondary leading-none" style={{ fontSize: 16, fontVariationSettings: '"opsz" 14' }}>
              {crewName.toUpperCase()}
            </p>
            <p className="font-silkscreen text-tertiary leading-none" style={{ fontSize: 8 }}>
              Squad Level {crewLevel}
            </p>
          </div>
        </div>

        <div className="flex-shrink-0" style={{ width: 2, height: 2, background: 'var(--color-border)' }} />

        <div className="flex items-center" style={{ gap: 8 }}>
          {sortedMembers.map((m) => {
            const url     = m.avatar_url as string | null | undefined
            const initial = m.username[0]?.toUpperCase() ?? '?'
            const online  = onlineUserIds.has(m.id)
            return (
              <div key={m.id} className="relative flex-shrink-0" title={m.username}>
                <div className="rounded-full overflow-hidden bg-surface flex items-center justify-center" style={{ width: 24, height: 24 }}>
                  {url ? (
                    <div className="relative w-full h-full">
                      <Image src={url} alt={m.username} fill sizes="24px" className="object-cover" loader={avatarImageLoader} />
                    </div>
                  ) : (
                    <span className="font-pixel text-[length:var(--text-mini)] text-purple">{initial}</span>
                  )}
                </div>
                {online && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Chevron — absolute top-right */}
      <button
        onClick={(e) => { e.stopPropagation(); onExpand() }}
        className="absolute right-0 top-0 flex items-center justify-center flex-shrink-0"
        style={{ width: 'var(--space-7)', height: 'var(--space-7)' }}
        aria-label="Show members"
      >
        <ChevronRight
          style={{ width: 'var(--space-7)', height: 'var(--space-7)', color: 'var(--color-tertiary)', transform: 'rotate(-90deg)' }}
          aria-hidden="true"
        />
      </button>

      {/* XP bar or Boss HP bar */}
      {combatEnabled && hasJoinedRaid && activeCombatRaid ? (
        <div className="flex flex-col w-full" style={{ gap: 'var(--space-3)' }}>
          <p className="font-silkscreen leading-none w-full" style={{ fontSize: 8, color: 'var(--color-danger)' }}>
            BOSS HP : {String(Math.round(activeCombatRaid.current_hp)).padStart(4, '0')}/{String(Math.round(activeCombatRaid.max_hp)).padStart(4, '0')}
          </p>
          <div className="bg-surface overflow-hidden w-full relative" style={{ height: 4 }}>
            <div
              className="absolute left-0 top-0 h-full"
              style={{
                width:      `${(activeCombatRaid.current_hp / activeCombatRaid.max_hp) * 100}%`,
                background: 'var(--color-danger)',
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col w-full" style={{ gap: 'var(--space-3)' }}>
          <p className="font-silkscreen text-tertiary leading-[0] w-full" style={{ fontSize: 0 }}>
            <span className="leading-none" style={{ fontSize: 8 }}>{getXPInCurrentLevel(crewXP)} / {getXPForCurrentLevel(crewXP)}XP</span>
            {totalMessages > 0 && <>
              <span className="leading-none" style={{ fontSize: 8 }}>{` · `}</span>
              <span className="leading-none text-secondary" style={{ fontSize: 8 }}>{totalMessages.toLocaleString()} total Squad msg.</span>
            </>}
          </p>
          <div className="bg-surface h-1 overflow-hidden w-full relative">
            <motion.div
              className="absolute left-0 top-0 h-full bg-purple"
              animate={{ width: `${xpProgress}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ─── ChatInput ────────────────────────────────────────────────────────────────

export function ChatInput({ crewId, userId, userProfile, memberProfiles, crewName, inviteCode, creatorId, crewImageUrl: initialCrewImageUrl, crewBackgroundImageUrl: initialCrewBgUrl, initialXP, isDM, dmPartnerId, userCombatClass, initialRaid, initialMemberStats, initialReviveTokens }: ChatInputProps) {
  const router = useRouter()
  const [text,           setText]          = useState('')
  const [sending,        setSending]        = useState(false)
  const [sendError,      setSendError]      = useState<string | null>(null)
  const [typingUsers,    setTypingUsers]    = useState<string[]>([])
  const [devMode,          setDevMode]          = useState(false)
  const [pollEnabled,      setPollEnabled]       = useState(false)
  const [eventsEnabled,    setEventsEnabled]     = useState(false)
  const [fxpEnabled,       setFxpEnabled]        = useState(false)
  const [combatEnabled,    setCombatEnabled]     = useState(false)
  const combatEnabledRef                         = useRef(false)
  const [gemToastVisible,   setGemToastVisible]   = useState(false)
  const [isExpanded,     setIsExpanded]     = useState(false)
  const [memberMsgCounts, setMemberMsgCounts] = useState<Map<string, number>>(new Map())
  const [loadingCounts,  setLoadingCounts]  = useState(false)
  const [removeTarget,   setRemoveTarget]   = useState<MemberProfile | null>(null)
  const [removing,       setRemoving]       = useState(false)
  const [removeError,    setRemoveError]    = useState<string | null>(null)
  const [kickedIds,      setKickedIds]      = useState<Set<string>>(new Set())
  const [crewImageUrl,   setCrewImageUrl]   = useState<string | null>(initialCrewImageUrl ?? null)
  const [crewImageFile,  setCrewImageFile]  = useState<File | null>(null)
  const [crewBgUrl,      setCrewBgUrl]      = useState<string | null>(initialCrewBgUrl ?? null)
  const [bgUploading,    setBgUploading]    = useState(false)
  const [showNotif,       setShowNotif]       = useState(false)
  const [notifPrefs,      setNotifPrefs]      = useState<NotifPrefs>({ messages: true, mentions: true })
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [showGifPicker,   setShowGifPicker]   = useState(false)
  const [mentionQuery,    setMentionQuery]    = useState<string | null>(null)
  const [mentionIndex,    setMentionIndex]    = useState(0)
  const [isFocused,       setIsFocused]       = useState(false)
  const [showEventSheet,  setShowEventSheet]  = useState(false)
  const [isMultiline,     setIsMultiline]     = useState(false)

  const [pendingImages,      setPendingImages]      = useState<PendingImage[]>([])
  const [friendshipToast,    setFriendshipToast]    = useState<{ totalXP: number; xpAwarded: number; partnerName: string; dailyCount: number } | null>(null)

  const textareaRef           = useRef<HTMLTextAreaElement>(null)
  const inputRef              = useRef<HTMLInputElement>(null)
  const mirrorRef             = useRef<HTMLSpanElement>(null)
  const innerContainerRef     = useRef<HTMLDivElement>(null)
  const pendingCaretPosRef    = useRef<number | null>(null)
  const isMultilineRef        = useRef(false)
  const textRef               = useRef('')
  const overlayRef            = useRef<HTMLDivElement>(null)
  const crewImageInputRef     = useRef<HTMLInputElement>(null)
  const crewBgInputRef        = useRef<HTMLInputElement>(null)
  const chatImageInputRef     = useRef<HTMLInputElement>(null)
  const rateRef               = useRef({ count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW })
  const typingTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const friendshipToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gemToastTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingChannelRef      = useRef<RealtimeChannel | null>(null)
  const msgChannelRef         = useRef<RealtimeChannel | null>(null)
  const channelReadyRef       = useRef(false)
  const {
    addMessage, removeMessage, updateMessage, setCrewXP, receiveXP, bumpCrewXP,
    crewXP, crewLevel,
    onlineUserIds, setOnlineUserIds, setLastActive, sweepOnlineUserIds, addUserCoins,
    crewName: storeCrewName, setCrewName,
    replyTo, setReplyTo,
    editTo, setEditTo,
    squadDetailsOpen, setSquadDetailsOpen,
  } = useChatStore()

  // Reactive combat state — re-renders when raid or member stats change
  const activeCombatRaid  = useCombatStore((s) => s.activeRaid)
  const combatMemberStats = useCombatStore((s) => s.memberStats)
  const hasJoinedRaid     = !!(activeCombatRaid && combatMemberStats[userId])

  const liveCrewName = storeCrewName || crewName

  // Keep refs in sync on every render so closures and effects always see current values
  textRef.current = text
  isMultilineRef.current = isMultiline

  const profilesRef       = useRef(memberProfiles)
  profilesRef.current     = memberProfiles
  const userProfileRef    = useRef(userProfile)
  userProfileRef.current  = userProfile
  const pendingImagesRef  = useRef<PendingImage[]>([])
  pendingImagesRef.current = pendingImages
  const xpProgress  = getXPProgress(crewXP)
  const members     = Object.values(memberProfiles).filter(m => !kickedIds.has(m.id))
  const memberCount = members.length

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
    setFxpEnabled(localStorage.getItem('nexus_friendship_xp') === '1')
    setPollEnabled(localStorage.getItem('nexus_poll_feature') === '1')
    setEventsEnabled(localStorage.getItem('nexus_events_enabled') === '1')
    const combatOn = localStorage.getItem('nexus_combat_system') === '1'
    setCombatEnabled(combatOn)
    combatEnabledRef.current = combatOn
    function onFxpChange(e: Event)    { setFxpEnabled((e as CustomEvent<{ on: boolean }>).detail.on) }
    function onPollChange(e: Event)   { setPollEnabled((e as CustomEvent<{ on: boolean }>).detail.on) }
    function onEventsChange(e: Event) { setEventsEnabled((e as CustomEvent<{ on: boolean }>).detail.on) }
    function onCombatChange(e: Event) {
      const on = (e as CustomEvent<{ on: boolean }>).detail.on
      setCombatEnabled(on)
      combatEnabledRef.current = on
    }
    window.addEventListener('nexus-friendship-xp-change', onFxpChange)
    window.addEventListener('nexus-poll-feature-change', onPollChange)
    window.addEventListener('nexus-events-feature-change', onEventsChange)
    window.addEventListener('nexus-combat-system-change', onCombatChange)
    return () => {
      window.removeEventListener('nexus-friendship-xp-change', onFxpChange)
      window.removeEventListener('nexus-poll-feature-change', onPollChange)
      window.removeEventListener('nexus-events-feature-change', onEventsChange)
      window.removeEventListener('nexus-combat-system-change', onCombatChange)
    }
  }, [])

  useEffect(() => {
    if (replyTo) focusField()
  }, [replyTo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Populate input when entering edit mode
  useEffect(() => {
    if (editTo) {
      setText(editTo.content)
      textRef.current = editTo.content
      requestAnimationFrame(() => {
        recheckOverflow(editTo.content)
        focusField()
      })
    }
  }, [editTo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear reply/edit state when leaving this crew so it never bleeds into the next chat
  useEffect(() => {
    return () => { setReplyTo(null); setEditTo(null) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Seed store with server-fetched values (previously handled by ChatHeader)
  useEffect(() => {
    if (initialXP !== undefined) setCrewXP(initialXP)
    setCrewName(crewName)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Seed combatStore with server-fetched raid/member data
  useEffect(() => {
    const store = useCombatStore.getState()
    store.clearCombatEvents()  // Scope log to this crew's current raid
    store.setActiveRaid(initialRaid ?? null)
    if (initialMemberStats) store.setAllMembers(Object.values(initialMemberStats))
    if (initialReviveTokens !== undefined) store.setReviveTokens(initialReviveTokens)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: keep combat state in sync
  useEffect(() => {
    const supabase = createClient()

    const combatCh = supabase
      .channel(`combat:${crewId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crew_combat_members' }, (payload) => {
        const store = useCombatStore.getState()
        if (!store.activeRaid) return
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const row = payload.new as CombatMember
          if (row.raid_id !== store.activeRaid?.id) return
          store.setMemberStats(row.user_id, row)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_raids' }, (payload) => {
        const store = useCombatStore.getState()
        const updated = payload.new as ActiveRaid
        if (updated.crew_id !== crewId) return
        if (updated.defeated_at) {
          store.setActiveRaid(null)
          store.setAllMembers([])
        } else {
          // Only patch fields not owned by system-message patches.
          // current_hp and phase are patched from COMBAT:* messages to avoid
          // stale active_raids UPDATE events racing and reverting correct HP.
          store.patchRaid({
            guard_user_id:       updated.guard_user_id,
            guard_expires_at:    updated.guard_expires_at,
            volley_expires_at:   updated.volley_expires_at,
            last_boss_attack_at: updated.last_boss_attack_at,
          })
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'active_raids' }, (payload) => {
        const newRaid = payload.new as ActiveRaid
        if (newRaid.crew_id !== crewId) return
        const store = useCombatStore.getState()
        // Skip if this INSERT is for a raid already in the store — a late-arriving
        // Postgres Changes event (after HP patches from COMBAT: messages) would
        // otherwise overwrite patched HP with the original spawn-time max HP
        if (store.activeRaid?.id === newRaid.id) return
        store.setActiveRaid(newRaid)
        // Fetch crew_combat_members immediately — Postgres Changes events across
        // tables have no ordering guarantee, so crew_combat_members INSERTs from
        // init_combat_members may have already arrived (and been dropped because
        // activeRaid was null). Re-fetch now that the raid is set.
        supabase
          .from('crew_combat_members')
          .select('id, raid_id, user_id, class, current_hp, max_hp, ability_bank, is_downed, downed_at, momentum_stack, last_msg_at, guard_expires_at')
          .eq('raid_id', newRaid.id)
          .then(({ data: members }) => {
            if (members && members.length > 0) store.setAllMembers(members as CombatMember[])
          })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'revive_tokens' }, (payload) => {
        const row = payload.new as { crew_id: string; count: number }
        if (row.crew_id !== crewId) return
        useCombatStore.getState().setReviveTokens(row.count)
      })
      .subscribe()

    return () => { supabase.removeChannel(combatCh) }
  }, [crewId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update last_seen every 60s for accurate server-side unread cursors
  useEffect(() => {
    const supabase = createClient()
    const update = async () => {
      try {
        await supabase
          .from('crew_members')
          .update({ last_seen: new Date().toISOString() })
          .eq('crew_id', crewId)
          .eq('user_id', userId)
      } catch {
        // Presence is best-effort
      }
    }
    update()
    const interval = setInterval(update, 60_000)
    return () => clearInterval(interval)
  }, [crewId, userId]) // eslint-disable-line

  useEffect(() => {
    if (!squadDetailsOpen) return
    setIsExpanded(true)
    setSquadDetailsOpen(false)
  }, [squadDetailsOpen]) // eslint-disable-line

  useEffect(() => {
    let cancelled = false
    setLoadingCounts(true)
    createClient()
      .rpc('get_crew_member_msg_counts', { p_crew_id: crewId })
      .then(({ data }) => {
        if (cancelled) return
        setMemberMsgCounts(new Map((data ?? []).map(r => [r.user_id, Number(r.msg_count)])))
        setLoadingCounts(false)
      })
    return () => { cancelled = true }
  }, [crewId]) // eslint-disable-line

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('crew_notification_preferences')
      .select('notif_messages, notif_mentions')
      .eq('user_id', userId)
      .eq('crew_id', crewId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setNotifPrefs({
          messages: data.notif_messages as boolean,
          mentions: data.notif_mentions as boolean,
        })
      })
    return () => { cancelled = true }
  }, [userId, crewId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleNotif = useCallback(async (type: keyof NotifPrefs) => {
    const next = { ...notifPrefs, [type]: !notifPrefs[type] }
    setNotifPrefs(next)
    await createClient()
      .from('crew_notification_preferences')
      .upsert(
        {
          user_id:        userId,
          crew_id:        crewId,
          notif_messages: next.messages,
          notif_mentions: next.mentions,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'user_id,crew_id' },
      )
  }, [notifPrefs, userId, crewId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync overlay scroll with the active field so highlighted text stays aligned.
  useEffect(() => {
    const field = isMultiline ? textareaRef.current : inputRef.current
    const ov = overlayRef.current
    if (!field || !ov) return
    const sync = () => {
      if (overlayRef.current) {
        overlayRef.current.scrollTop  = field.scrollTop
        overlayRef.current.scrollLeft = field.scrollLeft
      }
    }
    field.addEventListener('scroll', sync)
    return () => field.removeEventListener('scroll', sync)
  }, [isMultiline])

  // ─── Hybrid input/textarea helpers ─────────────────────────────────────────

  function getActiveField(): HTMLInputElement | HTMLTextAreaElement | null {
    return isMultilineRef.current ? textareaRef.current : inputRef.current
  }

  function focusField() {
    if (isMultilineRef.current) textareaRef.current?.focus()
    else inputRef.current?.focus()
  }

  // Measures text width via the hidden mirror span and swaps element type if needed.
  // Called on every keystroke and on container resize.
  const recheckOverflow = useCallback((val?: string, caretPos?: number) => {
    const currentVal = val ?? textRef.current
    const mirror     = mirrorRef.current
    const container  = innerContainerRef.current
    if (!mirror || !container) return

    mirror.textContent = currentVal || ''
    const mirrorWidth    = mirror.offsetWidth
    const containerWidth = container.clientWidth

    // 2px forward buffer, 6px hysteresis before swapping back — prevents thrashing at boundary
    const willWrap = mirrorWidth > containerWidth - 2
    const willFit  = mirrorWidth < containerWidth - 6

    if (!isMultilineRef.current && willWrap) {
      const pos = caretPos ?? (inputRef.current?.selectionStart ?? currentVal.length)
      pendingCaretPosRef.current = pos
      isMultilineRef.current = true
      setIsMultiline(true)
    } else if (isMultilineRef.current && willFit && !currentVal.includes('\n')) {
      const pos = caretPos ?? (textareaRef.current?.selectionStart ?? currentVal.length)
      pendingCaretPosRef.current = pos
      isMultilineRef.current = false
      setIsMultiline(false)
    } else if (isMultilineRef.current) {
      // Already in textarea mode — update height as content changes
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        const cs  = getComputedStyle(el)
        const lh  = parseFloat(cs.lineHeight) || 24
        const pt  = parseFloat(cs.paddingTop) || 12
        const pb  = parseFloat(cs.paddingBottom) || 12
        el.style.height = Math.min(el.scrollHeight, pt + pb + lh * 3) + 'px'
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore caret and set initial textarea height after element swap
  useLayoutEffect(() => {
    const pos = pendingCaretPosRef.current
    if (pos === null) return
    pendingCaretPosRef.current = null
    const el = isMultiline ? textareaRef.current : inputRef.current
    if (!el) return
    if (isMultiline && el instanceof HTMLTextAreaElement) {
      el.style.height = 'auto'
      const cs  = getComputedStyle(el)
      const lh  = parseFloat(cs.lineHeight) || 24
      const pt  = parseFloat(cs.paddingTop) || 12
      const pb  = parseFloat(cs.paddingBottom) || 12
      el.style.height = Math.min(el.scrollHeight, pt + pb + lh * 3) + 'px'
    }
    el.focus()
    el.setSelectionRange(pos, pos)
  }, [isMultiline])

  // Re-check overflow when the container is resized (orientation change, keyboard open/close)
  useEffect(() => {
    const container = innerContainerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => recheckOverflow())
    ro.observe(container)
    return () => ro.disconnect()
  }, [recheckOverflow])

  // ────────────────────────────────────────────────────────────────────────────

  function handleTopPanEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.y < -50 || info.velocity.y < -300) setIsExpanded(true)
  }

  useEffect(() => {
    // Seed self as online immediately; DB fetch + peer broadcasts will refine the set
    setLastActive(userId, Date.now())
    setOnlineUserIds(new Set([userId]))

    const supabase = createClient()
    const ch = supabase.channel(`messages:${crewId}`, {
      config: { presence: { key: userId } },
    })
    const fallbackProfile = (uid: string): MemberProfile =>
      profilesRef.current[uid] ?? { id: uid, username: '???', avatar_class: null, avatar_url: null }

    // Heartbeat: write to DB + broadcast timestamp so channel peers update their maps
    const heartbeat = () => {
      const ts = Date.now()
      setLastActive(userId, ts)
      ch.send({ type: 'broadcast', event: 'active', payload: { user_id: userId, ts } })
      supabase.rpc('update_active').then(() => {}, () => {})
    }

    // Seed initial online set from DB — covers users active in other crews
    const memberIds = Object.keys(profilesRef.current)
    if (memberIds.length > 0) {
      supabase
        .from('profiles')
        .select('id, last_active_at')
        .in('id', memberIds)
        .then(({ data }) => {
          if (!data) return
          const store = useChatStore.getState()
          data.forEach((p) => {
            if (p.last_active_at) store.setLastActive(p.id, new Date(p.last_active_at).getTime())
          })
          store.sweepOnlineUserIds(ONLINE_THRESHOLD_MS)
        })
    }

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    const startHeartbeat = () => {
      if (heartbeatTimer) return
      heartbeatTimer = setInterval(heartbeat, 30_000)
    }
    const stopHeartbeat = () => {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    }

    // Sweep stale entries from onlineUserIds every 15s — no network call, pure local math
    const sweepTimer = setInterval(
      () => useChatStore.getState().sweepOnlineUserIds(ONLINE_THRESHOLD_MS),
      15_000,
    )

    ch
      .on('presence', { event: 'sync' }, () => {
        // Presence channel used for typing indicators only — online status comes from timestamps
        const state = ch.presenceState<{ username: string; typing: boolean }>()
        const others = Object.entries(state)
          .filter(([key]) => key !== userId)
          .flatMap(([, presences]) => presences)
          .filter((p) => p.typing)
          .map((p) => p.username)
        setTypingUsers(others)
      })
      .on('broadcast', { event: 'active' }, ({ payload }) => {
        const { user_id: uid, ts } = payload as { user_id: string; ts: number }
        if (!uid || typeof ts !== 'number') return
        const store = useChatStore.getState()
        store.setLastActive(uid, ts)
        store.sweepOnlineUserIds(ONLINE_THRESHOLD_MS)
      })
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const msg = payload.payload as Message
        if (!msg?.id || typeof msg.content !== 'string') return
        addMessage({ ...msg, profile: fallbackProfile(msg.user_id) })
        // Optimistic XP bump for others' text/image messages — xp_update broadcast reconciles later
        if (msg.user_id !== userId && (msg.message_type === 'text' || msg.message_type === 'image') && !isDM) {
          useChatStore.getState().bumpCrewXP()
        }
      })
      .on('broadcast', { event: 'xp_update' }, (payload) => {
        const { xp_earned, new_total_xp, sender_id } =
          payload.payload as { xp_earned: number; new_total_xp: number; sender_id: string }
        if (typeof new_total_xp !== 'number') return
        if (sender_id === userId)               setCrewXP(new_total_xp)
        else if (xp_earned > 0 && !isDM)        receiveXP(xp_earned, new_total_xp)
        else                                    setCrewXP(new_total_xp)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channelReadyRef.current = true
          await ch.track({ username: userProfileRef.current.username, typing: false })
          heartbeat()
          startHeartbeat()
        }
      })

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Treat socket as suspect after backgrounding — re-track typing + fire heartbeat
        ch.track({ username: userProfileRef.current.username, typing: false }).catch(() => {})
        heartbeat()
        startHeartbeat()
      } else {
        // Stop heartbeating when hidden — let timestamp age naturally; no iOS throttle fights
        stopHeartbeat()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    msgChannelRef.current     = ch
    typingChannelRef.current  = ch
    channelReadyRef.current   = false
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopHeartbeat()
      clearInterval(sweepTimer)
      supabase.removeChannel(ch)
      msgChannelRef.current     = null
      typingChannelRef.current  = null
      channelReadyRef.current   = false
    }
  }, [crewId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  function broadcastTyping(isTyping: boolean) {
    typingChannelRef.current?.track({ username: userProfileRef.current.username, typing: isTyping })
  }

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const img = prev.find((i) => i.id === id)
      if (img?.localUrl.startsWith('blob:')) URL.revokeObjectURL(img.localUrl)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const clearPendingImages = useCallback(() => {
    setPendingImages((prev) => {
      prev.forEach((img) => { if (img.localUrl.startsWith('blob:')) URL.revokeObjectURL(img.localUrl) })
      return []
    })
  }, [])

  useEffect(() => {
    return () => {
      if (friendshipToastTimerRef.current) clearTimeout(friendshipToastTimerRef.current)
      if (gemToastTimerRef.current) clearTimeout(gemToastTimerRef.current)
      // Revoke any remaining blob URLs on unmount
      pendingImagesRef.current.forEach((img) => {
        if (img.localUrl.startsWith('blob:')) URL.revokeObjectURL(img.localUrl)
      })
    }
  }, [])

  const showGemToast = () => {
    if (gemToastTimerRef.current) clearTimeout(gemToastTimerRef.current)
    setGemToastVisible(true)
    gemToastTimerRef.current = setTimeout(() => setGemToastVisible(false), 3000)
  }

  async function handleChatImagesPick(files: File[]) {
    if (files.length === 0) return

    const networkQuality = getNetworkQuality()
    const qualityScale   = networkQuality === 'slow' ? 0.7 : networkQuality === 'medium' ? 0.85 : 1
    const quality        = IMAGE_CONFIG.CHAT_IMAGE_QUALITY * qualityScale
    const supabase       = createClient()

    // Create entries with blob URLs immediately — instant preview before upload
    const entries: PendingImage[] = files.map((file, i) => ({
      id:        `img_${Date.now()}_${i}`,
      localUrl:  URL.createObjectURL(file),
      publicUrl: null,
      lqip:      null,
      uploading: true,
      error:     null,
    }))

    setPendingImages((prev) => [...prev, ...entries].slice(0, 4))

    // Upload all in parallel
    await Promise.all(entries.map(async (entry, i) => {
      const file = files[i]
      const patch = (p: Partial<PendingImage>) =>
        setPendingImages((prev) => prev.map((img) => img.id === entry.id ? { ...img, ...p } : img))

      try {
        const validation = validateImageUpload(file)
        if (!validation.ok) { patch({ uploading: false, error: validation.error }); return }

        const [lqip, compressed] = await Promise.all([
          generateLQIP(file),
          compressImage(file, { maxWidthOrHeight: IMAGE_CONFIG.CHAT_IMAGE_MAX_WIDTH_PX, quality }),
        ])
        patch({ lqip })

        const ext  = file.type === 'image/gif' ? 'gif' : compressed.type.includes('jpeg') ? 'jpg' : 'webp'
        const path = `${crewId}/${userId}/${Date.now()}_${i}.${ext}`
        const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, compressed, {
          contentType:  file.type === 'image/gif' ? 'image/gif' : compressed.type,
          cacheControl: '31536000',
        })
        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
        patch({ publicUrl, uploading: false })
      } catch (err) {
        patch({ uploading: false, error: err instanceof Error ? err.message : 'Upload failed.' })
      }
    }))
  }

  const sendImages = useCallback(async () => {
    const readyImages = pendingImagesRef.current.filter((img) => !!img.publicUrl)
    if (readyImages.length === 0 || sending) return

    // Snapshot before clearing — uploads are done, these URLs are stable
    const snapshots = readyImages.map((img) => ({ publicUrl: img.publicUrl!, lqip: img.lqip }))

    setSending(true)
    setSendError(null)
    clearPendingImages()
    haptic(10)

    const supabase = createClient()
    let gemToastScheduled = false

    for (const { publicUrl, lqip } of snapshots) {
      const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      const optimisticMsg: MessageWithProfile = {
        id:              tempId,
        crew_id:         crewId,
        user_id:         userId,
        content:         publicUrl,
        message_type:    'image',
        element_type:    null,
        xp_awarded:      1,
        reactions:       {},
        created_at:      new Date().toISOString(),
        image_url:       publicUrl,
        image_blur_hash: lqip ?? undefined,
        profile:         userProfile,
        tempId,
      }
      addMessage(optimisticMsg)
      if (!isDM) bumpCrewXP()

      try {
        const { data: raw, error } = await supabase.rpc('insert_message', {
          p_crew_id:         crewId,
          p_content:         publicUrl,
          p_message_type:    'image',
          p_image_url:       publicUrl,
          p_image_blur_hash: lqip ?? null,
        })
        if (error) throw error
        if (!raw) throw new Error('No message returned from server.')

        const alreadyAdded = useChatStore.getState().messages.some((m) => m.id === raw.id)
        if (alreadyAdded) removeMessage(raw.id)
        updateMessage(tempId, {
          id: raw.id, created_at: raw.created_at, element_type: raw.element_type,
          image_url: publicUrl, image_blur_hash: lqip ?? undefined,
        })
        setHomeLastMessage(crewId, { content: raw.content, created_at: raw.created_at, sender: userProfile.username })

        if (channelReadyRef.current) msgChannelRef.current?.send({
          type: 'broadcast', event: 'new_message',
          payload: {
            id: raw.id, crew_id: raw.crew_id, user_id: raw.user_id,
            content: raw.content, message_type: raw.message_type,
            element_type: raw.element_type, xp_awarded: raw.xp_awarded,
            created_at: raw.created_at,
            image_url: publicUrl, image_blur_hash: lqip,
          },
        })

        // Only claim gem once across the batch
        if (!gemToastScheduled) {
          gemToastScheduled = true
          tryClaimDailyGem(supabase, showGemToast)
        }

        const msgId = raw.id
        fetch(`${SUPABASE_URL}/functions/v1/award-xp`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body:    JSON.stringify({ message_id: msgId, crew_id: crewId, user_id: userId, username: userProfile.username, message_type: 'image', content: publicUrl, mentioned_user_ids: [] }),
        })
          .then((r) => r.json())
          .then((data: { xp_earned?: number; new_total_xp?: number; coins_earned?: number }) => {
            if (typeof data.xp_earned === 'number') updateMessage(msgId, { xp_awarded: data.xp_earned })
            if (typeof data.new_total_xp === 'number') {
              setCrewXP(data.new_total_xp)
              if (channelReadyRef.current) msgChannelRef.current?.send({
                type: 'broadcast', event: 'xp_update',
                payload: { xp_earned: data.xp_earned ?? 0, new_total_xp: data.new_total_xp, sender_id: userId },
              })
            }
            if (typeof data.coins_earned === 'number' && data.coins_earned > 0) addUserCoins(data.coins_earned)
            callAttackBoss('image', (data.xp_earned ?? 0) === 0 && (data.coins_earned ?? 0) === 0)
          })
          .catch(() => {})

      } catch (err) {
        console.error('[sendImages]', err)
        removeMessage(tempId)
        setSendError(err instanceof Error ? err.message : 'Failed to send image.')
      }
    }

    setSending(false)
    focusField()
  }, [sending, crewId, userId, userProfile, isDM, addMessage, removeMessage, updateMessage, addUserCoins, bumpCrewXP, clearPendingImages]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendGif = useCallback(async (gifUrl: string) => {
    if (sending) return

    const tempId = `opt_${Date.now()}`
    setSending(true)
    setSendError(null)
    haptic(10)

    const optimisticMsg: MessageWithProfile = {
      id:              tempId,
      crew_id:         crewId,
      user_id:         userId,
      content:         gifUrl,
      message_type:    'image',
      element_type:    'nature',
      xp_awarded:      1,
      reactions:       {},
      created_at:      new Date().toISOString(),
      image_url:       gifUrl,
      image_blur_hash: undefined,
      profile:         userProfile,
      tempId,
    }
    addMessage(optimisticMsg)
    if (!isDM) bumpCrewXP()

    try {
      const supabase = createClient()
      const { data: raw, error } = await supabase.rpc('insert_message', {
        p_crew_id:         crewId,
        p_content:         gifUrl,
        p_message_type:    'image',
        p_image_url:       gifUrl,
        p_image_blur_hash: null,
      })
      if (error) throw error
      if (!raw) throw new Error('No message returned from server.')

      const alreadyAdded = useChatStore.getState().messages.some((m) => m.id === raw.id)
      if (alreadyAdded) {
        removeMessage(raw.id)
      }
      updateMessage(tempId, { id: raw.id, created_at: raw.created_at, element_type: raw.element_type, image_url: gifUrl })
      setHomeLastMessage(crewId, { content: raw.content, created_at: raw.created_at, sender: userProfile.username })

      if (channelReadyRef.current) msgChannelRef.current?.send({
        type: 'broadcast', event: 'new_message',
        payload: {
          id: raw.id, crew_id: raw.crew_id, user_id: raw.user_id,
          content: raw.content, message_type: raw.message_type,
          element_type: raw.element_type, xp_awarded: raw.xp_awarded,
          created_at: raw.created_at,
          image_url: gifUrl, image_blur_hash: null,
        },
      })

      tryClaimDailyGem(supabase, showGemToast)

      const msgId = raw.id
      fetch(`${SUPABASE_URL}/functions/v1/award-xp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ message_id: msgId, crew_id: crewId, user_id: userId, username: userProfile.username, message_type: 'image', content: gifUrl, mentioned_user_ids: [] }),
      })
        .then((r) => r.json())
        .then((data: { xp_earned?: number; new_total_xp?: number; coins_earned?: number }) => {
          if (typeof data.xp_earned === 'number') updateMessage(msgId, { xp_awarded: data.xp_earned })
          if (typeof data.new_total_xp === 'number') {
            setCrewXP(data.new_total_xp)
            if (channelReadyRef.current) msgChannelRef.current?.send({
              type: 'broadcast', event: 'xp_update',
              payload: { xp_earned: data.xp_earned ?? 0, new_total_xp: data.new_total_xp, sender_id: userId },
            })
          }
          if (typeof data.coins_earned === 'number' && data.coins_earned > 0) addUserCoins(data.coins_earned)
          callAttackBoss('image', (data.xp_earned ?? 0) === 0 && (data.coins_earned ?? 0) === 0)
        })
        .catch(() => {})

    } catch (err) {
      console.error('[sendGif]', err)
      removeMessage(tempId)
      setSendError(err instanceof Error ? err.message : 'Failed to send GIF.')
    } finally {
      setSending(false)
      focusField()
    }
  }, [sending, crewId, userId, userProfile, addMessage, removeMessage, updateMessage, addUserCoins]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async () => {
    const content = sanitizeMessage(text)
    if (!content || sending) return

    // Detect mentioned user IDs from @username patterns in the message
    const currentProfiles = profilesRef.current
    const usernameToId    = new Map(Object.values(currentProfiles).map((m) => [m.username.toLowerCase(), m.id]))
    const mentionedSet    = new Set<string>()
    const mentionRx       = /@(\w+)/g
    let mx: RegExpExecArray | null
    while ((mx = mentionRx.exec(content)) !== null) {
      const uid = usernameToId.get(mx[1].toLowerCase())
      if (uid && uid !== userId) mentionedSet.add(uid)
    }
    const mentionedUserIds = [...mentionedSet]

    const now = Date.now()
    if (now >= rateRef.current.resetAt) rateRef.current = { count: 0, resetAt: now + RATE_LIMIT_WINDOW }
    rateRef.current.count++
    if (rateRef.current.count > RATE_LIMIT_MAX) { setSendError('Slow down, warrior.'); return }

    if (!localStorage.getItem('nexus_first_message')) localStorage.setItem('nexus_first_message', String(Date.now()))

    // Capture reply context before clearing state
    const currentReply = useChatStore.getState().replyTo

    setSending(true)
    setSendError(null)
    setText('')
    textRef.current = ''
    setReplyTo(null)
    broadcastTyping(false)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    const wasMultiline = isMultilineRef.current
    setIsMultiline(false)
    isMultilineRef.current = false
    if (wasMultiline) pendingCaretPosRef.current = 0
    haptic(10)

    const supabase    = createClient()
    const replyToId       = currentReply?.id ?? null
    const replyPreview    = currentReply ? currentReply.content.slice(0, 100) : null
    const replyUsername   = currentReply?.profile?.username ?? null

    // Optimistic: add the message instantly so it appears before the RPC round-trip.
    const tempId = `opt_${Date.now()}`
    const optimisticMsg: MessageWithProfile = {
      id: tempId, crew_id: crewId, user_id: userId, content,
      message_type: 'text', element_type: null,
      xp_awarded: 1, reactions: {}, created_at: new Date().toISOString(),
      profile: userProfile,
      reply_to_id: replyToId, reply_preview: replyPreview, reply_username: replyUsername,
      tempId,
    }
    addMessage(optimisticMsg)
    if (!isDM) bumpCrewXP()

    try {
      const { data: raw, error } = await supabase.rpc('insert_message', {
        p_crew_id: crewId, p_content: content, p_message_type: 'text',
        p_reply_to_id: replyToId, p_reply_preview: replyPreview, p_reply_username: replyUsername,
      })
      if (error) throw error

      // Replace the optimistic message with the confirmed server row.
      // If a Postgres Changes INSERT arrived first, raw.id is already in the store
      // as a separate entry — remove that duplicate, then always patch the temp in
      // place so the virtualizer key (tempId) stays stable and avoids a key swap.
      const alreadyAdded = useChatStore.getState().messages.some((m) => m.id === raw.id)
      if (alreadyAdded) {
        removeMessage(raw.id)
      }
      updateMessage(tempId, { id: raw.id, created_at: raw.created_at, element_type: raw.element_type })
      setHomeLastMessage(crewId, { content: raw.content, created_at: raw.created_at, sender: userProfile.username })

      if (channelReadyRef.current) {
        msgChannelRef.current?.send({
          type: 'broadcast', event: 'new_message',
          payload: {
            id: raw.id, crew_id: raw.crew_id, user_id: raw.user_id,
            content: raw.content, message_type: raw.message_type,
            element_type: raw.element_type, xp_awarded: raw.xp_awarded,
            created_at: raw.created_at,
            reply_to_id: raw.reply_to_id, reply_preview: raw.reply_preview, reply_username: raw.reply_username,
          },
        })
        // Piggyback heartbeat on send — proves liveness, keeps DB timestamp fresh between intervals
        const ts = Date.now()
        setLastActive(userId, ts)
        msgChannelRef.current?.send({ type: 'broadcast', event: 'active', payload: { user_id: userId, ts } })
        supabase.rpc('update_active').then(() => {}, () => {})
      }

      tryClaimDailyGem(supabase, showGemToast)

      const msgId = raw.id
      fetch(`${SUPABASE_URL}/functions/v1/award-xp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ message_id: msgId, crew_id: crewId, user_id: userId, username: userProfile.username, message_type: 'text', content, mentioned_user_ids: mentionedUserIds }),
      })
        .then((r) => r.json())
        .then((data: { xp_earned?: number; new_total_xp?: number; coins_earned?: number }) => {
          if (typeof data.xp_earned === 'number') updateMessage(msgId, { xp_awarded: data.xp_earned })
          if (typeof data.new_total_xp === 'number') {
            setCrewXP(data.new_total_xp)
            if (channelReadyRef.current) msgChannelRef.current?.send({
              type: 'broadcast', event: 'xp_update',
              payload: { xp_earned: data.xp_earned ?? 0, new_total_xp: data.new_total_xp, sender_id: userId },
            })
          }
          if (typeof data.coins_earned === 'number' && data.coins_earned > 0) {
            addUserCoins(data.coins_earned)
          }
          // soft_blocked = no XP and no coins awarded (5s gap check fired)
          const softBlocked = (data.xp_earned ?? 0) === 0 && (data.coins_earned ?? 0) === 0
          callAttackBoss('text', softBlocked)
        })
        .catch(() => {})

      if (fxpEnabled) {
        // Friendship XP — shared helper: fade-in 200ms, hold 2000ms, then exit animation (400ms) runs
        const showFriendshipToast = (totalXP: number, xpAwarded: number, partnerName: string, dailyCount: number) => {
          if (friendshipToastTimerRef.current) clearTimeout(friendshipToastTimerRef.current)
          setFriendshipToast({ totalXP, xpAwarded, partnerName, dailyCount })
          friendshipToastTimerRef.current = setTimeout(() => setFriendshipToast(null), 2200)
        }

        // Local midnight as UTC ISO string — used by the server to compute the daily limit window
        const now = new Date()
        const localMidnightUTC = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString()

        // Friendship XP — DM send
        if (isDM && dmPartnerId) {
          const dmPartnerName = liveCrewName
          fetch(`${SUPABASE_URL}/functions/v1/award-friendship-xp`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
            body:    JSON.stringify({ user_a_id: userId, user_b_id: dmPartnerId, source: 'dm', local_midnight_utc: localMidnightUTC }),
          })
            .then((r) => r.json())
            .then((data: { total_xp?: number; xp_awarded?: number; skipped?: boolean; daily_count?: number }) => {
              if (typeof data.total_xp === 'number' && (data.xp_awarded ?? 0) > 0) {
                showFriendshipToast(data.total_xp, data.xp_awarded!, dmPartnerName, data.daily_count ?? 1)
              }
            })
            .catch(() => {})
        }

        // Friendship XP — @mention in group chat (toast for first awarded pair)
        if (!isDM && mentionedUserIds.length > 0) {
          let toastShown = false
          mentionedUserIds.forEach((friendId) => {
            const partnerName = profilesRef.current[friendId]?.username ?? 'Friend'
            fetch(`${SUPABASE_URL}/functions/v1/award-friendship-xp`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
              body:    JSON.stringify({ user_a_id: userId, user_b_id: friendId, source: 'mention', local_midnight_utc: localMidnightUTC }),
            })
              .then((r) => r.json())
              .then((data: { total_xp?: number; xp_awarded?: number; skipped?: boolean; daily_count?: number }) => {
                if (!toastShown && typeof data.total_xp === 'number' && (data.xp_awarded ?? 0) > 0) {
                  toastShown = true
                  showFriendshipToast(data.total_xp, data.xp_awarded!, partnerName, data.daily_count ?? 1)
                }
              })
              .catch(() => {})
          })
        }
      }

    } catch (err) {
      removeMessage(tempId)
      setText(content)
      textRef.current = content
      if (currentReply) setReplyTo(currentReply)
      setSendError(err instanceof Error ? err.message : 'Failed to send. Tap to retry.')
      requestAnimationFrame(() => recheckOverflow(content))
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [text, sending, crewId, userId, userProfile, addMessage, removeMessage, updateMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditSend = useCallback(async () => {
    const currentEdit = useChatStore.getState().editTo
    if (!currentEdit) return
    const newContent = sanitizeMessage(text)

    // Close edit mode immediately regardless of outcome
    setEditTo(null)
    setText('')
    textRef.current = ''
    const wasMultiline = isMultilineRef.current
    setIsMultiline(false)
    isMultilineRef.current = false
    if (wasMultiline) pendingCaretPosRef.current = 0

    if (!newContent || newContent === currentEdit.content) return

    const prevContent = currentEdit.content
    const msgId       = currentEdit.id

    // Optimistic update
    updateMessage(msgId, { content: newContent })

    const supabase = createClient()
    const { error } = await supabase
      .from('messages')
      .update({ content: newContent })
      .eq('id', msgId)
      .eq('user_id', userId)

    if (error) {
      updateMessage(msgId, { content: prevContent })
      setSendError('Failed to edit message.')
    }
  }, [text, userId, updateMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fire-and-forget attack-boss after award-xp settles (joined members only)
  const callAttackBoss = useCallback((messageType: string, softBlocked: boolean) => {
    const { activeRaid, memberStats } = useCombatStore.getState()
    if (!combatEnabledRef.current || !activeRaid || !memberStats[userId]) return
    fetch(`${SUPABASE_URL}/functions/v1/attack-boss`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body:    JSON.stringify({ crew_id: crewId, user_id: userId, username: userProfile.username, message_type: messageType, soft_blocked: softBlocked }),
    }).catch(() => {})
  }, [crewId, userId, userProfile]) // eslint-disable-line react-hooks/exhaustive-deps


  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    // @mention picker navigation
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'Escape')    { e.preventDefault(); setMentionQuery(null); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return }
      if (e.key === 'Enter')     { e.preventDefault(); completeMention(mentionMatches[mentionIndex].username); return }
    }

    if (e.key === 'Escape' && text.startsWith('/') && !text.includes(' ')) {
      e.preventDefault()
      setText('')
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (editTo) { void handleEditSend(); return }
      const isCmd = text.startsWith('/') && !text.includes(' ')
      if (isCmd) {
        const filter   = text.slice(1).toLowerCase()
        const matches  = SLASH_COMMANDS.filter((c) => c.name.startsWith(filter) && (c.name !== 'event' || eventsEnabled))
        if (matches.length === 1) { executeCommand(matches[0].name); return }
      }
      send()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    const val    = target.value.slice(0, MAX_MESSAGE_LENGTH)
    setText(val)
    textRef.current = val

    const caretPos = target.selectionStart ?? val.length
    recheckOverflow(val, caretPos)

    if (val.trim()) {
      broadcastTyping(true)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => broadcastTyping(false), 3000)
    } else { broadcastTyping(false) }
    // Detect @mention query at cursor position
    const q = getMentionQuery(val, caretPos)
    setMentionQuery(q)
    if (q !== null) setMentionIndex(0)
  }

  function handleBlur() {
    broadcastTyping(false)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    setIsFocused(false)
  }

  async function executeCommand(name: SlashCommandName) {
    setText('')
    textRef.current = ''
    const wasMultiline = isMultilineRef.current
    setIsMultiline(false)
    isMultilineRef.current = false
    if (wasMultiline) pendingCaretPosRef.current = 0
    else focusField()

    if (name === 'event') {
      if (eventsEnabled) setShowEventSheet(true)
      return
    }

    if (name === 'birthdays') {
      setSending(true)
      setSendError(null)
      try {
        const result = await birthdaysCommandAction(crewId)
        if (result.error) {
          setSendError(result.error)
        } else if (result.message) {
          const msgWithProfile = { ...result.message, profile: userProfile }
          addMessage(msgWithProfile)
          if (channelReadyRef.current) msgChannelRef.current?.send({
            type: 'broadcast', event: 'new_message',
            payload: {
              id: msgWithProfile.id, crew_id: msgWithProfile.crew_id, user_id: msgWithProfile.user_id,
              content: msgWithProfile.content, message_type: msgWithProfile.message_type,
              element_type: msgWithProfile.element_type, xp_awarded: msgWithProfile.xp_awarded,
              created_at: msgWithProfile.created_at,
            },
          })
        }
      } finally {
        setSending(false)
      }
    }
  }

  function handlePollCreated(message: MessageWithProfile) {
    setShowPollCreator(false)
    addMessage(message)
    if (channelReadyRef.current) msgChannelRef.current?.send({
      type: 'broadcast', event: 'new_message',
      payload: {
        id: message.id, crew_id: message.crew_id, user_id: message.user_id,
        content: message.content, message_type: message.message_type,
        element_type: message.element_type, xp_awarded: message.xp_awarded,
        created_at: message.created_at,
      },
    })
  }

  async function handleKick() {
    if (!removeTarget || removing) return
    setRemoving(true)
    setRemoveError(null)
    const result = await kickMemberAction(crewId, removeTarget.id)
    setRemoving(false)
    if (result.error) { setRemoveError(result.error); return }
    setKickedIds(prev => new Set([...prev, removeTarget.id]))
    setRemoveTarget(null)
  }

  async function handleLeaveSquad() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setIsExpanded(false)
    await leaveCrewAction(crewId, session.access_token)
    router.push('/home')
  }

  // ─── @mention helpers ───────────────────────────────────────────────────────

  function getMentionQuery(val: string, cursorPos: number): string | null {
    const before = val.slice(0, cursorPos)
    const atIdx  = before.lastIndexOf('@')
    if (atIdx === -1) return null
    const query = before.slice(atIdx + 1)
    if (/[\s\n]/.test(query)) return null
    return query
  }

  function completeMention(username: string) {
    const field = getActiveField()
    if (!field) return
    const pos     = field.selectionStart ?? text.length
    const before  = text.slice(0, pos)
    const after   = text.slice(pos)
    const atIdx   = before.lastIndexOf('@')
    if (atIdx === -1) return
    const newText = before.slice(0, atIdx) + '@' + username + ' ' + after
    setText(newText)
    textRef.current = newText
    setMentionQuery(null)
    setMentionIndex(0)
    requestAnimationFrame(() => {
      const f = getActiveField()
      if (f) {
        const cur = atIdx + username.length + 2
        f.focus()
        f.setSelectionRange(cur, cur)
      }
    })
  }

  function renderHighlightedInput(val: string): React.ReactNode {
    const memberSet = new Set(members.map((m) => m.username.toLowerCase()))
    const regex     = /@(\w+)/g
    const parts: React.ReactNode[] = []
    let lastIdx = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(val)) !== null) {
      if (memberSet.has(match[1].toLowerCase())) {
        if (match.index > lastIdx) parts.push(val.slice(lastIdx, match.index))
        parts.push(
          <mark key={match.index} style={{ background: 'transparent', color: 'var(--color-purple)' }}>
            @{match[1]}
          </mark>
        )
        lastIdx = match.index + match[0].length
      }
    }
    if (lastIdx < val.length) parts.push(val.slice(lastIdx))
    parts.push('​')
    return parts
  }

  const mentionMatches = mentionQuery !== null
    ? members.filter((m) => m.id !== userId && m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : []

  const typingLabel = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length === 2
      ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
      : typingUsers.length > 2 ? 'Several warriors are typing...' : null

  const totalMessages = [...memberMsgCounts.values()].reduce((s, n) => s + n, 0)

  return (
    <div
      className={`bg-black border-t ${!isDM && combatEnabled && hasJoinedRaid ? 'border-[var(--color-danger)]' : 'border-border'} flex flex-col flex-shrink-0 relative z-[65]`}
      style={{
        paddingTop:    'var(--space-5)',
        paddingLeft:   'var(--space-5)',
        paddingRight:  'var(--space-5)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
        gap:           'var(--space-5)',
      }}
    >
      {!isDM && combatEnabled && (
        <DamageFloatLayer />
      )}

      {/* ── Friendship XP toast (DM send or group @mention) — dev-gated: nexus_friendship_xp ── */}
      {fxpEnabled && (
        <FriendshipXPToast
          visible={!!friendshipToast}
          xpAwarded={friendshipToast?.xpAwarded ?? 0}
          totalXP={friendshipToast?.totalXP ?? 0}
          partnerName={friendshipToast?.partnerName ?? ''}
          dailyCount={friendshipToast?.dailyCount ?? 1}
        />
      )}

      {/* ── Daily gem toast ── */}
      <GemToast visible={gemToastVisible} stacked={!!friendshipToast} />


      {/* ── DM: "Chatting with" label ── */}
      {isDM && (
        <p className="font-silkscreen text-[12px] leading-none">
          <span className="text-tertiary">Chatting with </span>
          <span className="text-purple">{liveCrewName.toLowerCase()}</span>
        </p>
      )}

      {/* ── ChatSquadDetailBar — tap or swipe up to expand ── */}
      {!isDM && (
        <ChatSquadDetailBar
          crewImageUrl={crewImageUrl}
          crewName={liveCrewName}
          crewLevel={crewLevel}
          members={members}
          onlineUserIds={onlineUserIds}
          combatEnabled={combatEnabled}
          hasJoinedRaid={hasJoinedRaid}
          activeCombatRaid={activeCombatRaid}
          crewXP={crewXP}
          xpProgress={xpProgress}
          totalMessages={totalMessages}
          onExpand={() => setIsExpanded(true)}
          onPanEnd={handleTopPanEnd}
        />
      )}

      {/* ── Status indicators + input — fade out when expanded ── */}
      <motion.div
        animate={{ opacity: isExpanded ? 0 : 1, y: isExpanded ? 16 : 0 }}
        transition={{ duration: 0.18 }}
        style={{ pointerEvents: isExpanded ? 'none' : 'auto' }}
      >
        {sendError && (
          <button className="w-full font-pixel text-[7px] text-[#ff4444] mb-2 text-left" onClick={send}>
            ↺ {sendError}
          </button>
        )}

        {typingLabel && (
          <div className="flex items-center gap-1 mb-2">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="inline-block w-1 h-1 rounded-full bg-purple animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
            <span className="font-pixel text-[7px] text-tertiary">{typingLabel}</span>
          </div>
        )}

        {/* ── Edit mode bar ── */}
        {editTo && (
          <div
            className="flex items-center w-full"
            style={{ background: 'var(--color-surface)', padding: 16, gap: 8, marginBottom: 8 }}
          >
            <MagicEdit style={{ width: 16, height: 16, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
            <p
              className="flex-1 min-w-0 font-body font-medium leading-none tracking-[0.1px] whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}
            >
              Editing message
            </p>
            <button
              onClick={() => { setEditTo(null); setText(''); textRef.current = '' }}
              className="flex-shrink-0 flex items-center justify-center active:opacity-60"
              style={{ width: 32, height: 32, marginRight: -8 }}
              aria-label="Cancel edit"
            >
              <Close style={{ width: 16, height: 16, color: 'var(--color-secondary)' }} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* ── Reply preview bar ── */}
        {replyTo && (
          <div
            className="flex items-center w-full"
            style={{ background: 'var(--color-surface)', padding: 16, gap: 8, marginBottom: 8 }}
          >
            <Undo style={{ width: 16, height: 16, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
            <p
              className="flex-1 min-w-0 font-body font-medium leading-none tracking-[0.1px] whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
            >
              <span style={{ color: 'var(--color-primary)' }}>Replying to </span>
              <span style={{ color: 'var(--color-purple)' }}>@{replyTo.profile?.username ?? replyTo.reply_username ?? '???'}</span>
            </p>
            <button
              onClick={() => setReplyTo(null)}
              className="flex-shrink-0 flex items-center justify-center active:opacity-60"
              style={{ width: 32, height: 32, marginRight: -8 }}
              aria-label="Cancel reply"
            >
              <Close style={{ width: 16, height: 16, color: 'var(--color-secondary)' }} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* ── Input wrapper: pickers float above via absolute positioning ── */}
        <div className="relative">
          {/* @mention picker — absolute, grows upward over group details */}
          <AnimatePresence>
            {mentionQuery !== null && mentionMatches.length > 0 && (
              <motion.div
                key="mention-menu"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full left-0 right-0 border border-border bg-black"
              >
                <div className="nexus-scroll" style={{ maxHeight: 220, overflowY: 'scroll' }}>
                {mentionMatches.map((m, i) => {
                  const url     = m.avatar_url as string | null | undefined
                  const initial = m.username[0]?.toUpperCase() ?? '?'
                  const isLast  = i === mentionMatches.length - 1
                  return (
                    <button
                      key={m.id}
                      onMouseDown={(e) => { e.preventDefault(); completeMention(m.username) }}
                      className={`w-full flex items-center overflow-hidden p-2 text-left ${!isLast ? 'border-b border-border' : ''} ${i === mentionIndex ? 'bg-surface' : 'active:bg-surface'}`}
                      style={{ gap: 'var(--space-3)' }}
                    >
                      <div className="w-6 h-6 flex-shrink-0 overflow-hidden bg-surface flex items-center justify-center">
                        {url ? (
                          <div className="relative w-full h-full">
                            <Image src={url} alt={m.username} fill sizes="24px" className="object-cover" loader={avatarImageLoader} />
                          </div>
                        ) : (
                          <span className="font-pixel text-[length:var(--text-mini)] text-purple">{initial}</span>
                        )}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0 items-start">
                        <span className="font-silkscreen text-[length:var(--text-mini)] text-purple leading-normal w-full">@mention</span>
                        <span className="font-body font-normal text-[length:var(--text-xs)] text-primary leading-normal w-full" style={{ fontVariationSettings: '"opsz" 14' }}>{m.username}</span>
                      </div>
                    </button>
                  )
                })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Slash command menu — absolute, grows upward over group details ── */}
          {(() => {
            const isCmd = text.startsWith('/') && !text.includes(' ')
            const filter = isCmd ? text.slice(1).toLowerCase() : ''
            const matches = isCmd ? SLASH_COMMANDS.filter((c) => c.name.startsWith(filter) && (c.name !== 'event' || eventsEnabled)) : []
            if (!isCmd || matches.length === 0) return null
            return (
              <AnimatePresence>
                <motion.div
                  key="cmd-menu"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-0 right-0 border border-border bg-black"
                >
                  <div className="nexus-scroll" style={{ maxHeight: 220, overflowY: 'scroll' }}>
                  {matches.map((cmd, i) => {
                    const isLast = i === matches.length - 1
                    return (
                      <button
                        key={cmd.name}
                        onMouseDown={(e) => { e.preventDefault(); executeCommand(cmd.name) }}
                        className={`w-full flex flex-col items-start overflow-hidden p-2 text-left active:bg-surface ${!isLast ? 'border-b border-border' : ''}`}
                      >
                        <span className="font-silkscreen text-[length:var(--text-mini)] text-purple leading-normal w-full">/{cmd.name}</span>
                        <span className="font-body font-normal text-[length:var(--text-xs)] text-tertiary leading-normal w-full" style={{ fontVariationSettings: '"opsz" 14' }}>{cmd.description}</span>
                      </button>
                    )
                  })}
                  </div>
                </motion.div>
              </AnimatePresence>
            )
          })()}

          <div className="flex items-center" style={{ gap: 16 }}>
            {/* GIF + Attachment icons — outside the input border, slide out on focus */}
            <motion.div
              className="flex-shrink-0 overflow-hidden flex items-center"
              animate={{ width: isFocused ? 0 : (pollEnabled ? 104 : 64), opacity: isFocused ? 0 : 1, marginRight: isFocused ? -16 : 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              style={{ pointerEvents: isFocused ? 'none' : 'auto', gap: 16 }}
            >
              <button
                onClick={() => setShowGifPicker(true)}
                className="flex-shrink-0 flex items-center justify-center text-tertiary active:text-purple"
                style={{ width: 24, height: 24 }}
                aria-label="Send GIF"
              >
                <GifIcon style={{ width: 24, height: 24 }} aria-hidden="true" />
              </button>
              <button
                onClick={() => chatImageInputRef.current?.click()}
                disabled={pendingImages.length >= 4}
                className="flex-shrink-0 flex items-center justify-center text-tertiary active:text-purple disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ width: 24, height: 24 }}
                aria-label="Upload photo"
              >
                <Attachment style={{ width: 24, height: 24 }} aria-hidden="true" />
              </button>
              {pollEnabled && (
                <button
                  onClick={() => setShowPollCreator(true)}
                  className="flex-shrink-0 flex items-center justify-center text-tertiary active:text-purple"
                  style={{ width: 24, height: 24 }}
                  aria-label="Create poll"
                >
                  <Chart style={{ width: 24, height: 24 }} aria-hidden="true" />
                </button>
              )}
            </motion.div>

            {/* Input container — flex-col when images are staged; outline turns purple on focus */}
            <div
              className="flex-1 flex flex-col transition-colors"
              style={{
                outline:       '1px solid',
                outlineColor:  isFocused ? 'var(--color-purple)' : 'var(--color-border)',
                outlineOffset: '-1px',
                paddingLeft:   16,
                paddingRight:  16,
                paddingTop:    pendingImages.length > 0 ? 16 : 0,
                paddingBottom: pendingImages.length > 0 ? 16 : 0,
                gap:           pendingImages.length > 0 ? 16 : 0,
                minHeight:     48,
              }}
            >
              {/* ── Image tray (inside border, animates in/out) ── */}
              <AnimatePresence>
                {pendingImages.length > 0 && (
                  <motion.div
                    key="image-tray"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    {/* 60×60 image slots — gap 8px, matches Figma */}
                    <div className="flex items-start" style={{ gap: 8 }}>
                      {pendingImages.map((img) => (
                        <div key={img.id} className="relative flex-shrink-0" style={{ width: 60, height: 60 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.localUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                          {img.uploading && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <span className="font-pixel text-[6px] text-white leading-none">···</span>
                            </div>
                          )}
                          {img.error && (
                            <div className="absolute inset-0 bg-[#ef4444]/70 flex items-center justify-center">
                              <span className="font-pixel text-[5px] text-white leading-none text-center px-1">ERR</span>
                            </div>
                          )}
                          {/* Close button — top-right, 2px inset, matches Figma */}
                          <button
                            onClick={() => removePendingImage(img.id)}
                            className="absolute flex items-center justify-center active:opacity-70"
                            style={{ top: 2, right: 2, width: 16, height: 16, background: 'rgba(0,0,0,0.65)' }}
                            aria-label="Remove image"
                          >
                            <Close style={{ width: 10, height: 10, color: 'var(--color-primary)' }} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Divider between image tray and text row */}
                    <div style={{ height: 1, background: 'var(--color-border)', marginTop: 16 }} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Text input + send button row ── */}
              <div className="flex items-center" style={{ gap: 16, minHeight: pendingImages.length > 0 ? 18 : 48 }}>
                <div ref={innerContainerRef} className="relative flex-1 min-w-0 overflow-hidden">
                  {/* Hidden mirror span — measures text pixel width for overflow detection */}
                  <span
                    ref={mirrorRef}
                    aria-hidden="true"
                    className="font-body"
                    style={{
                      position: 'fixed',
                      top: -9999,
                      left: -9999,
                      visibility: 'hidden',
                      pointerEvents: 'none',
                      whiteSpace: 'pre',
                      fontSize: 14,
                      lineHeight: 'normal',
                      fontVariationSettings: '"opsz" 14',
                    }}
                  />
                  {/* Overlay renders @mention highlights behind the transparent input/textarea */}
                  <div
                    ref={overlayRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 font-body text-[14px] leading-normal overflow-hidden"
                    style={{ paddingTop: 12, paddingBottom: 12, fontVariationSettings: '"opsz" 14', whiteSpace: isMultiline ? 'pre-wrap' : 'nowrap', wordBreak: isMultiline ? 'break-word' : 'normal', color: 'var(--color-primary)' }}
                  >
                    {renderHighlightedInput(text)}
                  </div>
                  {isMultiline ? (
                    <textarea
                      ref={textareaRef}
                      value={text}
                      onChange={(e) => handleInput(e)}
                      onKeyDown={(e) => handleKeyDown(e)}
                      onBlur={handleBlur}
                      placeholder={isDM ? 'Send a message...' : 'Message the squad...'}
                      rows={1}
                      onFocus={() => setIsFocused(true)}
                      className="relative w-full bg-transparent font-body text-[14px] placeholder:text-muted resize-none focus:outline-none leading-normal"
                      style={{ paddingTop: 12, paddingBottom: 12, fontVariationSettings: '"opsz" 14', color: 'transparent', caretColor: 'var(--color-primary)', overflowY: 'auto', overflowX: 'hidden' }}
                    />
                  ) : (
                    <input
                      ref={inputRef}
                      type="text"
                      value={text}
                      onChange={(e) => handleInput(e)}
                      onKeyDown={(e) => handleKeyDown(e)}
                      onBlur={handleBlur}
                      placeholder={isDM ? 'Send a message...' : 'Message the squad...'}
                      onFocus={() => setIsFocused(true)}
                      className="relative w-full bg-transparent font-body text-[14px] placeholder:text-muted focus:outline-none leading-normal"
                      style={{ paddingTop: 12, paddingBottom: 12, fontVariationSettings: '"opsz" 14', color: 'transparent', caretColor: 'var(--color-primary)' }}
                    />
                  )}
                </div>
                {(() => {
                  const isCmd       = text.startsWith('/') && !text.includes(' ')
                  const hasMatch    = isCmd && SLASH_COMMANDS.some((c) => c.name.startsWith(text.slice(1).toLowerCase()))
                  const canSendImgs = pendingImages.some((img) => !!img.publicUrl) && !pendingImages.some((img) => img.uploading)
                  const canSendText = !!text.trim() && !hasMatch
                  const canSend     = canSendImgs || canSendText
                  return (
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        onClick={editTo ? () => void handleEditSend() : canSendImgs ? sendImages : send}
                        disabled={editTo ? !text.trim() : !canSend || sending}
                        className={`flex items-center justify-center w-4 h-4 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${canSend ? 'text-purple' : 'text-muted'}`}
                        aria-label="Send message"
                      >
                        <Send style={{ width: 16, height: 16 }} aria-hidden="true" />
                      </button>
                    </div>
                  )
                })()}
              </div>{/* end text+send row */}
            </div>{/* end input container */}
          </div>{/* end icons+input row */}
        </div>{/* end relative wrapper */}
      </motion.div>

      {/* ── Kick confirmation sheet ── */}
      <AnimatePresence>
        {removeTarget && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!removing) setRemoveTarget(null) }}
          >
            <div className="absolute inset-0 bg-black/60" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative w-full max-w-[480px] bg-surface border-t border-border-hover flex flex-col gap-6 p-4"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex flex-col gap-2">
                <p className="font-pixel text-[8px] text-tertiary leading-none">REMOVE FROM SQUAD</p>
                <div className="flex flex-col gap-1">
                  <h2
                    className="font-body font-bold text-[18px] text-primary leading-none"
                    style={{ fontVariationSettings: '"opsz" 14' }}
                  >
                    {removeTarget.username}
                  </h2>
                  <p className="font-body text-[12px] text-secondary leading-normal">
                    Removing this member will redistribute their XP and any gains within the squad equally to all remaining members.
                  </p>
                </div>
              </div>

              {removeError && (
                <p className="font-silkscreen text-[8px] text-[#ef4444] leading-none">{removeError}</p>
              )}

              {/* Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleKick}
                  disabled={removing}
                  className="w-full h-12 flex items-center justify-center bg-[#ef4444] disabled:opacity-50 transition-opacity active:opacity-70"
                >
                  <span className="font-pixel text-[8px] text-primary leading-none">
                    {removing ? '...' : 'REMOVE MEMBER'}
                  </span>
                </button>
                <button
                  onClick={() => { setRemoveTarget(null); setRemoveError(null) }}
                  disabled={removing}
                  className="w-full h-12 flex items-center justify-center transition-opacity active:opacity-70"
                >
                  <span className="font-pixel text-[8px] text-tertiary leading-none">CANCEL</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Expanded member panel ── */}
      <AnimatePresence>
        {isExpanded && !isDM && (
          <SquadDetailsSheet
            crewId={crewId}
            crewName={liveCrewName}
            memberCount={memberCount}
            crewImageUrl={crewImageUrl}
            members={members.map((m): MiniMember => ({
              id:           m.id,
              username:     m.username,
              avatar_url:   m.avatar_url as string | null,
              avatar_class: m.avatar_class,
              status:       m.status,
            }))}
            onlineUserIds={onlineUserIds}
            crewXP={crewXP}
            crewLevel={crewLevel}
            xpProgress={xpProgress}
            totalMessages={totalMessages}
            inviteCode={inviteCode}
            creatorId={creatorId}
            currentUserId={userId}
            memberMsgCounts={memberMsgCounts}
            loadingCounts={loadingCounts}
            crewBackgroundImageUrl={crewBgUrl}
            onUploadPhoto={() => crewImageInputRef.current?.click()}
            onUploadBackground={() => crewBgInputRef.current?.click()}
            onNotifPress={() => setShowNotif(true)}
            onSave={async (newName) => {
              const trimmed = newName.trim()
              if (!trimmed || trimmed.length < 2) return
              const prev = liveCrewName
              setCrewName(trimmed)
              const result = await renameCrewAction(crewId, trimmed)
              if (result?.error) setCrewName(prev)
            }}
            onTapMember={(memberId) => {
              setIsExpanded(false)
              sessionStorage.setItem('nexus_chat_from', 'chat')
              router.push(`/chat/${crewId}/member/${memberId}`)
            }}
            onDMPress={(memberId) => {
              setIsExpanded(false)
              router.push(`/dm/${memberId}`)
            }}
            onOpenGlossary={() => {
              setIsExpanded(false)
              router.push(`/chat/${crewId}/definitions`)
            }}
            onRemoveMember={(member) => setRemoveTarget(member as MemberProfile)}
            onLeave={handleLeaveSquad}
            onClose={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNotif && (
          <NotifSheet
            prefs={notifPrefs}
            onToggle={handleToggleNotif}
            onClose={() => setShowNotif(false)}
          />
        )}
      </AnimatePresence>

      {/* File input outside any transformed container — iOS Safari drops .click() inside transforms */}
      <input
        ref={crewImageInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setCrewImageFile(f)
          e.target.value = ''
        }}
      />

      {/* Background image picker */}
      <input
        ref={crewBgInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file || bgUploading) return
          setBgUploading(true)
          try {
            const supabase = createClient()
            const ts       = Date.now()
            const blob     = await resizeImageToBlob(file, 1080, 608)
            const path     = `${crewId}/bg-${ts}.webp`
            const { error: upErr } = await supabase.storage.from('crew-images')
              .upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' })
            if (!upErr) {
              const { data: { publicUrl } } = supabase.storage.from('crew-images').getPublicUrl(path)
              await updateCrewBackgroundImageAction(crewId, publicUrl)
              setCrewBgUrl(publicUrl)
            }
          } catch { /* non-fatal */ }
          setBgUploading(false)
        }}
      />

      {/* Chat image picker — fixed position prevents .click() issues in transforms */}
      <input
        ref={chatImageInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const files     = Array.from(e.target.files ?? [])
          const remaining = 4 - pendingImagesRef.current.length
          if (files.length > 0 && remaining > 0) void handleChatImagesPick(files.slice(0, remaining))
          e.target.value = ''
        }}
      />

      <CrewImageUploadModal
        file={crewImageFile}
        crewId={crewId}
        onClose={() => setCrewImageFile(null)}
        onSuccess={(url) => setCrewImageUrl(url)}
      />

      <AnimatePresence>
        {showPollCreator && (
          <PollCreatorSheet
            crewId={crewId}
            userProfile={userProfile}
            onClose={() => setShowPollCreator(false)}
            onCreated={handlePollCreated}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGifPicker && (
          <GifPickerSheet
            onSelect={(gifUrl) => { setShowGifPicker(false); void sendGif(gifUrl) }}
            onClose={() => setShowGifPicker(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEventSheet && eventsEnabled && (
          <EventCreationSheet
            crewId={crewId}
            currentUserId={userId}
            onClose={() => setShowEventSheet(false)}
            createMessage
          />
        )}
      </AnimatePresence>
    </div>
  )
}
