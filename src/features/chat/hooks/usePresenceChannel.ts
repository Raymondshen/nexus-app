import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/shared/supabase/client'
import { useChatStore } from '@/store/chatStore'
import { PRESENCE_ONLINE_THRESHOLD_MS, config } from '@/shared/constants/config'
import { computeOnlineIds, setsEqual } from '@/shared/utils/presence'
import { notifyActiveCrew } from '@/shared/utils/notifications'
import { acquireCrewMessageChannel, releaseCrewMessageChannel, isActiveCrewMessageChannel, evictCrewMessageChannel } from '@/shared/supabase/crewMessageChannel'
import type { MemberProfile } from '@/features/chat/components/input/ChatInput'
import type { Message } from '@/types'

const ONLINE_THRESHOLD_MS = PRESENCE_ONLINE_THRESHOLD_MS
// Minimum gap between update_active DB writes triggered outside the 30s heartbeat interval
const ACTIVE_WRITE_THROTTLE_MS = 10_000

interface UsePresenceChannelParams {
  crewId:         string
  userId:         string
  userProfile:    MemberProfile
  isDM?:          boolean
  memberProfiles: Record<string, MemberProfile>
}

// Owns the crew's realtime channel for the lifetime of the mounted chat room:
// acquire/subscribe, presence heartbeat + DB seed/sweep, typing broadcast, and
// CLOSED-channel rebuild with backoff. Extracted verbatim out of ChatInput (which
// had grown to ~2,500 lines mixing this with composer/mention/send/squad-management
// concerns) — see that file's own history for the reasoning behind every choice
// here; nothing about the underlying behavior changed in the move.
export function usePresenceChannel({ crewId, userId, userProfile, isDM, memberProfiles }: UsePresenceChannelParams) {
  const addMessage    = useChatStore((s) => s.addMessage)
  const setCrewXP     = useChatStore((s) => s.setCrewXP)
  const receiveXP     = useChatStore((s) => s.receiveXP)
  const setLastActive = useChatStore((s) => s.setLastActive)
  const channelEpoch  = useChatStore((s) => s.channelEpoch)

  // Synced via layout effect (fires synchronously after render, before paint or any
  // other effect) rather than a bare `ref.current = x` assignment in the render body
  // — the two are practically equivalent for these read-only-in-callbacks refs, but
  // only the effect form satisfies react-hooks/refs (writing a ref during render is
  // flagged even when, as here, nothing reads it back during that same render).
  const profilesRef    = useRef(memberProfiles)
  const userProfileRef = useRef(userProfile)
  useLayoutEffect(() => {
    profilesRef.current    = memberProfiles
    userProfileRef.current = userProfile
  })

  const msgChannelRef      = useRef<RealtimeChannel | null>(null)
  const channelReadyRef    = useRef(false)
  const isTypingRef        = useRef(false)
  const typingTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActiveWriteRef = useRef(0)
  // CLOSED-channel rebuild state — see the CLOSED branch in the subscribe callback.
  // attempts drives the backoff (reset on SUBSCRIBED); pendingRebuild defers a
  // rebuild that hit while backgrounded until the next foreground.
  const rebuildTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rebuildAttemptsRef = useRef(0)
  const pendingRebuildRef  = useRef(false)

  // Single place that actually persists a presence write — throttled so a DB round
  // trip only happens once per ACTIVE_WRITE_THROTTLE_MS regardless of which call site
  // (heartbeat interval, foreground-resume, or a message-send piggyback) asked for it.
  // Takes an existing client rather than calling createClient() itself — the mount
  // effect's heartbeat fires every 30s for the life of the room session, and
  // createBrowserClient() isn't free (GoTrueClient init, cookie reads, an
  // auto-refresh timer) — constructing a fresh one per tick would leak that cost
  // for as long as the chat screen stays open.
  const writePresence = useCallback((ts: number, client: ReturnType<typeof createClient>) => {
    if (ts - lastActiveWriteRef.current < ACTIVE_WRITE_THROTTLE_MS) return
    lastActiveWriteRef.current = ts
    client.rpc('update_active').then(() => {}, (err) => {
      if (config.isDev) console.warn('[presence] update_active failed', err)
    })
  }, [])

  useEffect(() => {
    // Mark self online instantly, without discarding already-known peer presence
    // (so a member who's already known online in this crew keeps showing online
    // through a remount instead of flashing to empty); DB fetch + peer broadcasts
    // below refine the rest of the set.
    useChatStore.getState().markSelfOnline(userId)

    // Tell the SW this crew's chat is open so a push for it can be suppressed —
    // the message is already visible here via Realtime. Only announce while the
    // page is actually foregrounded; handleVisibilityChange below keeps it in sync.
    if (document.visibilityState === 'visible') notifyActiveCrew(crewId)

    const supabase = createClient()
    // Shared with MessageList's postgres_changes listeners — see crewMessageChannel.ts.
    // This effect remains the sole owner of the actual .subscribe() call (deferred
    // below) since it also owns the presence/heartbeat lifecycle.
    const ch = acquireCrewMessageChannel(crewId, userId)
    const fallbackProfile = (uid: string): MemberProfile =>
      profilesRef.current[uid] ?? { id: uid, username: '???', avatar_class: null, avatar_url: null }

    // Heartbeat: write to DB + broadcast timestamp so channel peers update their maps
    const heartbeat = () => {
      const ts = Date.now()
      setLastActive(userId, ts)
      ch.send({ type: 'broadcast', event: 'active', payload: { user_id: userId, ts } })
      writePresence(ts, supabase)
    }

    // Seed/resync online set from DB — covers members active outside this tab, and
    // (via the visibilitychange call below) members who came online/went offline while
    // this device was backgrounded. Realtime 'active' broadcasts alone can't be trusted
    // to catch that window: iOS suspends the socket's deliverability while the PWA is
    // backgrounded/screen-locked, phoenix broadcasts are fire-and-forget (never queued
    // for a suspended client to replay on resume), and a brief background often doesn't
    // even trip CLOSED/rejoin — so nothing else re-reads the true DB state afterward.
    const seedPeerPresenceFromDb = () => {
      const memberIds = Object.keys(profilesRef.current)
      if (memberIds.length === 0) return
      supabase
        .from('user_presence')
        .select('user_id, last_active_at')
        .in('user_id', memberIds)
        .then(({ data }) => {
          if (!data) return
          // Build peer entries — skip self to protect the fresh Date.now() from markSelfOnline
          const peerEntries: Record<string, number> = {}
          data.forEach((p) => {
            if (p.user_id === userId || !p.last_active_at) return
            peerEntries[p.user_id] = new Date(p.last_active_at).getTime()
          })
          // Single atomic update: merge peers into map (peerEntries' fresh DB timestamp
          // overwrites any stale locally-known one for that same id) and recompute the
          // online set in one shot.
          useChatStore.setState((s) => {
            const lastActiveMap = { ...s.lastActiveMap, ...peerEntries }
            return { lastActiveMap, onlineUserIds: computeOnlineIds(lastActiveMap, ONLINE_THRESHOLD_MS) }
          })
        })
    }
    seedPeerPresenceFromDb()

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    const startHeartbeat = () => {
      if (heartbeatTimer) return
      heartbeatTimer = setInterval(heartbeat, 30_000)
    }
    const stopHeartbeat = () => {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    }

    // Sweep stale entries from onlineUserIds every 5s — no network call, pure local math.
    // This is only the Tier-2 (timestamp/TTL) fallback's own decay cadence — the presence
    // membership diff below is what actually makes the common case (someone in THIS room
    // closes/backgrounds) near-instant instead of waiting on this sweep.
    const sweepTimer = setInterval(
      () => useChatStore.getState().sweepOnlineUserIds(ONLINE_THRESHOLD_MS),
      5_000,
    )

    // Tracks who was present on this channel as of the last sync, so the handler below
    // can tell "membership actually changed" (someone's socket joined/left this room)
    // apart from "sync re-fired for an unrelated reason" (e.g. a typing-state track()
    // update on an existing key also re-fires 'sync' for everyone on the channel).
    // Starts null rather than an empty Set so the very first sync (our own join) just
    // records the baseline instead of firing a reseed — seedPeerPresenceFromDb() was
    // already called directly above; the first sync's membership is a subset of what
    // that call just fetched, so re-firing for it would just be a duplicate query.
    let presentPeerKeys: Set<string> | null = null
    let reseedDebounceTimer: ReturnType<typeof setTimeout> | null = null

    ch
      .on('presence', { event: 'sync' }, () => {
        // Single presenceState() read, reused for both the membership diff below and
        // the typing extraction — Phoenix hands back the same live state either way,
        // no reason to ask twice per sync.
        const state = ch.presenceState<{ username: string; typing: boolean }>()
        const keys = new Set(Object.keys(state))

        // Presence channel is authoritative for typing; for online status it's used only
        // as an instant TRIGGER, never an instant verdict — a user's absence from this one
        // room's channel does not mean they're offline (they may be chatting in a
        // different crew right now), so leaving this channel can't be asserted as
        // "offline" here. What it CAN safely do is fast-path the same DB re-check
        // seedPeerPresenceFromDb already does on a schedule, firing it (debounced, so a
        // burst of several joins/leaves at once collapses into one query instead of one
        // per event) instead of waiting up to ONLINE_THRESHOLD_MS + the sweep cadence
        // above. In the common case — the person you're actively looking at closes their
        // tab — this turns "notice within ~45-50s" into "notice within one DB round trip"
        // without asserting anything unverified, since update_active() genuinely stopped
        // being called the moment their own heartbeat stopped.
        if (presentPeerKeys === null) {
          presentPeerKeys = keys
        } else if (!setsEqual(keys, presentPeerKeys)) {
          presentPeerKeys = keys
          if (reseedDebounceTimer) clearTimeout(reseedDebounceTimer)
          reseedDebounceTimer = setTimeout(() => {
            reseedDebounceTimer = null
            seedPeerPresenceFromDb()
          }, 400)
        }

        // Written into chatStore (not local state) — see ChatTypingIndicator; the store's own
        // equality check bails out when this sync didn't actually change who's typing.
        // The presence key IS the user id (see acquireCrewMessageChannel call below), so a
        // single user can still have >1 presence entry under that key (e.g. the same account
        // open in two tabs/devices at once) — collapse to one entry per key ("any connection
        // for this user is typing" instead of flatMap-ing every connection's own row) or a
        // user with two open sessions renders as two duplicate "X and X are typing..." names.
        const others = Object.entries(state)
          .filter(([key]) => key !== userId)
          .filter(([, presences]) => presences.some((p) => p.typing))
          .map(([, presences]) => presences[0].username)
        useChatStore.getState().setTypingUsernames(others)
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
    // A CLOSED status is terminal: realtime-js removes the channel from its socket
    // and never rejoins it (unlike CHANNEL_ERROR/TIMED_OUT, which phoenix's rejoin
    // timer recovers), and the same channel instance can't be re-subscribed —
    // phoenix's join() throws on a second call. The server sends this close on
    // realtime tenant restarts, auth kicks, and rate-limit enforcement. Recovery
    // is a brand-new channel: evict the dead one from the registry and bump the
    // shared channelEpoch so this effect AND MessageList's listener effect re-run
    // and re-acquire/re-attach against a fresh instance. Exponential backoff caps
    // the loop if the server is mid-restart and keeps closing us.
    const scheduleChannelRebuild = () => {
      if (!isActiveCrewMessageChannel(crewId, ch)) return
      if (rebuildTimerRef.current) return
      const delay = Math.min(1000 * 2 ** rebuildAttemptsRef.current, 30_000)
      rebuildAttemptsRef.current++
      rebuildTimerRef.current = setTimeout(() => {
        rebuildTimerRef.current = null
        if (!isActiveCrewMessageChannel(crewId, ch)) return
        evictCrewMessageChannel(crewId, ch)
        useChatStore.getState().bumpChannelEpoch()
      }, delay)
    }

    // Defer the single subscribe() call to a microtask so it always runs after every
    // same-tick mount effect (MessageList's postgres_changes listeners included) has
    // attached its .on() bindings — regardless of which component's effect ran first.
    // The isActiveCrewMessageChannel guard skips a stale call if this exact channel
    // instance was already torn down before the microtask fired (StrictMode dev
    // double-invoke: mount → cleanup → mount all happen synchronously before this runs).
    queueMicrotask(() => {
      if (!isActiveCrewMessageChannel(crewId, ch)) return
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channelReadyRef.current = true
          rebuildAttemptsRef.current = 0
          await ch.track({ username: userProfileRef.current.username, typing: false })
          heartbeat()
          startHeartbeat()
          // SUBSCRIBED fires on the initial join AND on every auto-rejoin after a
          // drop — so this is exactly when to backfill anything that landed while
          // the socket was down. Dedup-safe (see MessageList.resyncMessages).
          useChatStore.getState().requestResync?.()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Socket is not deliverable — stop broadcasting into the void (a send
          // while this is false skips the broadcast; peers get it via Postgres
          // Changes once we rejoin, and our own catch-up runs on the next
          // SUBSCRIBED). realtime-js auto-rejoins after CHANNEL_ERROR/TIMED_OUT;
          // CLOSED needs the full rebuild above (deferred to foreground when
          // hidden — a rebuild while backgrounded would just die again).
          channelReadyRef.current = false
          if (config.isDev) console.warn('[realtime] channel status', status, 'for crew', crewId)
          if (status === 'CLOSED') {
            if (document.visibilityState === 'visible') scheduleChannelRebuild()
            else pendingRebuildRef.current = true
          }
        }
      })
    })

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // A CLOSED status that landed while backgrounded deferred its rebuild to
        // now — run it first so the fresh channel (not the dead one) carries the
        // presence/heartbeat below.
        if (pendingRebuildRef.current) {
          pendingRebuildRef.current = false
          scheduleChannelRebuild()
        }
        // Treat socket as suspect after backgrounding — re-track typing + fire
        // heartbeat. Skip the presence round-trip when the channel is known-dead
        // (track() on a closed channel throws, and it's wasted rate-limit budget).
        if (channelReadyRef.current) {
          ch.track({ username: userProfileRef.current.username, typing: false }).catch(() => {})
        }
        heartbeat()
        startHeartbeat()
        notifyActiveCrew(crewId)
        // Re-read peer presence from the DB rather than trusting whatever broadcasts
        // happened to arrive while backgrounded — see seedPeerPresenceFromDb above for
        // why broadcasts alone can't be trusted to have covered that window. This is
        // what makes the online-avatar row (ChatSquadDetailBar) accurate immediately on
        // foreground instead of waiting up to one more 30s peer heartbeat cycle.
        seedPeerPresenceFromDb()
        // Backfill anything that arrived while backgrounded. If the socket stayed
        // up (brief background) no SUBSCRIBED re-fires, so this is the only catch-up
        // trigger for that case; if it dropped, this runs before the rejoin's
        // SUBSCRIBED and that one runs again — both are dedup-safe.
        useChatStore.getState().requestResync?.()
      } else {
        // Stop heartbeating when hidden — let timestamp age naturally; no iOS throttle fights
        stopHeartbeat()
        notifyActiveCrew(null)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Network came back (e.g. tunnel, elevator, wifi↔cellular handoff) without a
    // visibility change — nudge presence and catch up on the missed window.
    function handleOnline() {
      heartbeat()
      startHeartbeat()
      seedPeerPresenceFromDb()
      useChatStore.getState().requestResync?.()
    }
    window.addEventListener('online', handleOnline)

    msgChannelRef.current     = ch
    channelReadyRef.current   = false
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      stopHeartbeat()
      clearInterval(sweepTimer)
      if (reseedDebounceTimer) clearTimeout(reseedDebounceTimer)
      if (rebuildTimerRef.current) { clearTimeout(rebuildTimerRef.current); rebuildTimerRef.current = null }
      pendingRebuildRef.current = false
      releaseCrewMessageChannel(crewId)
      msgChannelRef.current     = null
      channelReadyRef.current   = false
      isTypingRef.current       = false
      // Clear so a stale "X is typing" from this crew never bleeds into the next
      // crew's chat before its own first presence sync arrives.
      useChatStore.getState().setTypingUsernames([])
      notifyActiveCrew(null)
    }
    // channelEpoch is deliberately a dep — a bump evicts the dead channel and
    // forces this effect to rebuild against a fresh one (see scheduleChannelRebuild).
  }, [crewId, userId, channelEpoch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Presence .track() is a network round-trip — only send it on an actual state
  // transition instead of on every keystroke. Skipped entirely while the channel
  // isn't joined: track() on a closed channel throws (unhandled rejection noise),
  // and every dropped call is wasted presence rate-limit budget
  // (ClientPresenceRateLimitReached shows up in realtime logs). isTypingRef is left
  // untouched on the skip so the next keystroke after the channel recovers re-sends
  // the edge.
  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (!channelReadyRef.current) return
    if (isTypingRef.current === isTyping) return
    isTypingRef.current = isTyping
    msgChannelRef.current?.track({ username: userProfileRef.current.username, typing: isTyping }).catch(() => {})
  }, [])

  // Every place that clears/replaces the composer's text outside of the input's own
  // onChange must call this too — broadcastTyping/the 3s debounce timer only fire
  // from notifyTyping below, so a programmatic text clear alone leaves "X is
  // typing..." stuck for stale viewers until the old debounce timer happens to fire.
  const clearTypingState = useCallback(() => {
    broadcastTyping(false)
    if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null }
  }, [broadcastTyping])

  // Called from the composer's onChange on every keystroke: broadcasts the typing
  // edge and (re)arms the 3s auto-clear debounce while there's content, or clears
  // immediately once the field empties out.
  const notifyTyping = useCallback((hasContent: boolean) => {
    if (hasContent) {
      broadcastTyping(true)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => broadcastTyping(false), 3000)
    } else {
      clearTypingState()
    }
  }, [broadcastTyping, clearTypingState])

  // Broadcasts the authoritative server row (already contains every column via the
  // insert_message RPC's RETURNING *) — avoids hand-picking fields that can drift
  // from what was actually written. Self-gates on channelReadyRef, so callers don't
  // need to check readiness themselves.
  const broadcastNewMessage = useCallback((message: Message) => {
    if (!channelReadyRef.current) return
    msgChannelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: message })
  }, [])

  // Broadcasts an xp_update to peers after award-xp settles — same self-gating as
  // broadcastNewMessage.
  const broadcastXpUpdate = useCallback((payload: { xp_earned: number; new_total_xp: number; sender_id: string }) => {
    if (!channelReadyRef.current) return
    msgChannelRef.current?.send({ type: 'broadcast', event: 'xp_update', payload })
  }, [])

  // Piggybacks a presence heartbeat on a successful message send — proves liveness,
  // keeps the DB timestamp fresh between the regular 30s interval ticks. Gated on
  // channelReadyRef exactly like the original inline call site this replaces: no
  // heartbeat piggyback (local store write, broadcast, or DB write) fires while the
  // channel isn't joined.
  const pingPresence = useCallback(() => {
    if (!channelReadyRef.current) return
    const ts = Date.now()
    setLastActive(userId, ts)
    msgChannelRef.current?.send({ type: 'broadcast', event: 'active', payload: { user_id: userId, ts } })
    writePresence(ts, createClient())
  }, [userId, setLastActive, writePresence])

  return { broadcastNewMessage, broadcastXpUpdate, pingPresence, notifyTyping, clearTypingState }
}
