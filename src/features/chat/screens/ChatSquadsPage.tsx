'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Close } from 'pixelarticons/react/Close'
import { Plus } from 'pixelarticons/react/Plus'
import { SlidePage, useSlideBack, skipNextSlideEnter } from '@/app/layouts/SlidePage'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { Button } from '@/shared/components/ui/Button'
import { createClient } from '@/shared/supabase/client'
import { pinCrewAction } from '@/app/(app)/chat/actions'
import { leaveCrewAction } from '@/app/(app)/home/actions'
import { SwipePreviewCard } from '@/features/chat/components/input/SwipePreviewCard'
import {
  NotificationPreviewCard,
  NoNotificationsCard,
  ScrollEqualizerBars,
  RoomPinSheet,
  CARD_WIDTH,
  CARD_GAP,
  CARD_STEP,
  EQUALIZER_WINDOW,
  CREATE_SQUAD_ID,
  PIN_LONG_PRESS_MS,
  itemId,
  type BrowseRoom,
  type BrowseItem,
} from '@/features/chat/components/input/SquadsListShared'
import { useChatRoomPeekStore, type RoomMeta } from '@/features/chat/store/chatRoomPeekStore'

// ─── ChatSquadsPage (Figma 589:3617 "chatroom notificationSquad") ─────────────
// A standalone page reached by tapping ChatFloatingNav's Menu icon (see that
// component's own doc comment for why this had to be a real route rather than
// another client-side overlay: ChatFloatingNav is a server-composed sibling of
// ChatInput, not its parent, so it has no access to ChatInput's own overlay
// state). This is the room-quick-switch + Notifications content
// ChatRoomBrowseSheet used to render alongside Group Details before that sheet
// was simplified to solely show Group Details (see that file's own doc
// comment) — this page reuses SquadsListShared.tsx's exported pieces
// (NotificationPreviewCard/NoNotificationsCard/ScrollEqualizerBars/
// RoomPinSheet/BrowseRoom/BrowseItem/etc, moved there from ChatRoomBrowseSheet
// once that sheet stopped needing them itself) plus SwipePreviewCard as-is,
// rather than re-implementing any of it.
//
// New element this Figma frame adds that ChatRoomBrowseSheet's old combined
// view didn't have: the "Invite Friends" button (Figma 642:7830) — a plain
// outlined-purple `Button`, not the richer `InviteCodeCard`/`ShareModal`
// treatment used elsewhere; tapping it copies the same invite message those
// two already use ("Come join my squad on Nexus app {code}"), for the CURRENT
// room's own invite code, with a brief "Copied!" label swap.
//
// Header: `PageHeader` `variant="sheet"` `titleColor="primary"` — no existing
// variant matched this exact combination (bold DM Sans, no back chevron, but
// `--color-primary` not `--color-secondary`), so that prop was added to
// PageHeader rather than hand-rolling a header here.
//
// Room selection preserves ChatInput's swipe-nav peek/ghost transition
// (ChatRoomPeekLayer) — the ONLY place that ever triggered it was
// ChatRoomBrowseSheet's own room-card tap (`commitRoomSwitch`, now removed
// from ChatInput along with the rest of its Squads-row plumbing), so this
// page reimplements that same short sequence directly against the shared
// `chatRoomPeekStore` rather than letting the whole ghost-transition feature
// go silently unreachable: seed `setPeek({phase:'committing'})` + call
// `skipNextSlideEnter(true)` + set `nexus_chat_from` (same history-stacking
// guard ChatInput's own onLibrary/ChatFloatingNav's Menu button use) right
// before `router.push`. Direction is derived from this page's own `rooms`
// order (index comparison), same as `commitRoomSwitch` used chatRoomOrder for.
// `roomMeta` is also seeded here for every room in `rooms` on mount (a
// `useEffect`, since it's a store write, not derivable during render) — this
// page's server-fetched data already has everything RoomMeta needs, so the
// peek ghost's room-name label resolves immediately on the very first swipe
// even for a room the user has never actually opened this session, unlike
// ChatInput's own prefetch (which only warms rooms already in chatRoomOrder,
// and only once ITS OWN browse sheet — now Group-Details-only — happens to open).
export interface ChatSquadsPageProps {
  crewId:       string
  inviteCode:   string
  rooms:        BrowseRoom[]
  pinnedRoomId: string | null
}

export function ChatSquadsPage({ crewId, inviteCode, rooms: initialRooms, pinnedRoomId: initialPinnedRoomId }: ChatSquadsPageProps) {
  const router  = useRouter()
  const goBack  = useSlideBack()
  const rowRef  = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  // Rooms left via this page's own long-press menu, without ever navigating
  // into them — filtered out below so a left room stops appearing without
  // needing a full reload. Same pattern ChatInput's `locallyLeftRoomIds` uses
  // for its own (now-removed) copy of this same list.
  const [locallyLeftRoomIds, setLocallyLeftRoomIds] = useState<Set<string>>(new Set())
  // Optimistic pin state — rolled back on server error, same as ChatInput's
  // own (now-removed) `handlePinCrew`.
  const [pinnedRoomId, setPinnedRoomId] = useState(initialPinnedRoomId)
  const rooms = initialRooms.filter((r) => !locallyLeftRoomIds.has(r.id))

  // Seed chatRoomPeekStore.roomMeta for every room this page knows about — see
  // this file's top doc comment for why (the peek ghost's room-name label
  // needs it, and this page's server data covers rooms ChatInput's own
  // client-side prefetch might not have warmed yet). One `setRoomMetaBulk` call,
  // not a per-room loop of `setRoomMeta` — the store's `roomMeta` is a single
  // subscribed object (ChatRoomPeekLayer reads the whole map), so N separate
  // `set()` calls would trigger N re-renders of every subscriber instead of one.
  useEffect(() => {
    const entries: Record<string, RoomMeta> = {}
    for (const room of initialRooms) {
      const { id, ...meta } = room
      entries[id] = meta
    }
    useChatRoomPeekStore.getState().setRoomMetaBulk(entries)
  }, [initialRooms])

  const items: BrowseItem[] = [{ kind: 'create' }, ...rooms.map((room): BrowseItem => ({ kind: 'room', room }))]

  const indexOfCurrentItem = () => {
    const idx = items.findIndex((it) => it.kind === 'room' && it.room.id === crewId)
    return idx === -1 ? Math.min(1, items.length - 1) : idx
  }
  const [focusedIndex, setFocusedIndex] = useState(indexOfCurrentItem)

  // One-time "snap to the current room" on mount — see ChatRoomBrowseSheet's
  // old equivalent effect (SquadsListShared's card-step math) for why this
  // needs to be a real DOM mutation (scrollLeft can't be set during render).
  useLayoutEffect(() => {
    if (rowRef.current) rowRef.current.scrollLeft = indexOfCurrentItem() * CARD_STEP
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Boundary checks come first because a CARD_STEP-multiple division alone
  // never reaches the row's true max scrollLeft (the viewport is wider than
  // one card), so the last item would never register as focused without them.
  function handleScroll() {
    const el = rowRef.current
    if (!el || items.length === 0) return
    const maxScrollLeft = el.scrollWidth - el.clientWidth
    let idx: number
    if (el.scrollLeft <= 1) {
      idx = 0
    } else if (el.scrollLeft >= maxScrollLeft - 1) {
      idx = items.length - 1
    } else {
      idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / CARD_STEP)))
    }
    setFocusedIndex((prev) => (prev === idx ? prev : idx))
  }

  const half = Math.floor(EQUALIZER_WINDOW / 2)
  const windowStart = Math.max(0, Math.min(focusedIndex - half, Math.max(0, items.length - EQUALIZER_WINDOW)))
  const equalizerItems = items.slice(windowStart, windowStart + EQUALIZER_WINDOW)
  const focusedItemId  = items[focusedIndex] ? itemId(items[focusedIndex]) : undefined

  // Long-press (hold) a room card to open the Pin/Leave Squad sheet — see
  // SquadsListShared's RoomPinSheet doc comment.
  const [pinSheetRoomId, setPinSheetRoomId] = useState<string | null>(null)
  const pinLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinLongPressFiredRef = useRef(false)

  function handleCardPressStart(roomId: string) {
    pinLongPressFiredRef.current = false
    pinLongPressTimer.current = setTimeout(() => {
      pinLongPressFiredRef.current = true
      setPinSheetRoomId(roomId)
    }, PIN_LONG_PRESS_MS)
  }
  function clearCardPressTimer() {
    if (pinLongPressTimer.current) {
      clearTimeout(pinLongPressTimer.current)
      pinLongPressTimer.current = null
    }
  }
  const pinSheetRoom = pinSheetRoomId ? rooms.find((r) => r.id === pinSheetRoomId) ?? null : null

  async function handlePinCrew(targetCrewId: string) {
    const previous = pinnedRoomId
    setPinnedRoomId(targetCrewId)
    const result = await pinCrewAction(targetCrewId)
    if (result.error) setPinnedRoomId(previous)
  }

  // Leaving as the last member permanently deletes the crew (CASCADE wipes its
  // messages and vibes) — gate that path behind an explicit warning, same as
  // ChatInput's own (now-removed) requestLeaveSquad/performLeaveSquad.
  const [leaveTarget, setLeaveTarget] = useState<{ id: string; name: string } | null>(null)
  const [showLastMemberWarning, setShowLastMemberWarning] = useState(false)
  const [leavingSquad, setLeavingSquad] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  function requestLeaveSquad(target: { id: string; name: string; memberCount: number }) {
    if (target.memberCount <= 1) {
      setLeaveTarget(target)
      setShowLastMemberWarning(true)
      return
    }
    void performLeaveSquad(target)
  }

  async function performLeaveSquad(target: { id: string; name: string }) {
    setLeavingSquad(true)
    setLeaveError(null)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLeavingSquad(false); return }
    const result = await leaveCrewAction(target.id, session.access_token)
    if (result?.error) {
      setLeavingSquad(false)
      setShowLastMemberWarning(false)
      setLeaveError(result.error)
      return
    }
    setLeavingSquad(false)
    setShowLastMemberWarning(false)
    setLeaveTarget(null)
    if (target.id === crewId) {
      // The room this page was opened from — nothing left to show here.
      router.push('/home')
    } else {
      setLocallyLeftRoomIds((prev) => new Set(prev).add(target.id))
    }
  }

  // Whichever room has unread messages and received one most recently — same
  // pick ChatRoomBrowseSheet's old Notifications section used.
  const notifRoom = rooms
    .filter((r) => r.unreadCount > 0)
    .sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bt - at
    })[0]

  function handleSelectRoom(roomId: string) {
    if (roomId === crewId) { goBack(); return }
    const currentIndex = rooms.findIndex((r) => r.id === crewId)
    const targetIndex  = rooms.findIndex((r) => r.id === roomId)
    const direction: 'left' | 'right' = targetIndex > currentIndex ? 'left' : 'right'
    useChatRoomPeekStore.getState().setPeek({ targetCrewId: roomId, direction, x: 0, phase: 'committing' })
    skipNextSlideEnter(true)
    sessionStorage.setItem('nexus_chat_from', 'chat')
    router.push(`/chat/${roomId}`)
  }

  function handleInviteCopy() {
    if (copied) return
    navigator.clipboard.writeText(`Come join my squad on Nexus app ${inviteCode}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  return (
    <SlidePage
      className="min-h-screen bg-black flex flex-col"
      style={{
        position:    'fixed',
        top: 0, bottom: 0, left: 0, right: 0,
        maxWidth:    480,
        marginLeft:  'auto',
        marginRight: 'auto',
        overflow:    'hidden',
      }}
    >
      <PageHeader
        title="Squads"
        variant="sheet"
        titleColor="primary"
        right={
          <button
            type="button"
            onClick={goBack}
            className="flex-shrink-0 appearance-none flex items-center justify-center"
            style={{ width: 24, height: 24 }}
            aria-label="Close"
          >
            <Close style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>
        }
      />

      <div
        className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          gap:            'var(--space-5)',
          paddingLeft:    'var(--md)',
          paddingRight:   'var(--md)',
          paddingBottom:  'max(env(safe-area-inset-bottom), var(--space-5))',
        }}
      >
        <div className="flex flex-col w-full flex-shrink-0" style={{ gap: 'var(--space-5)' }}>
          <Button variant="outlined" className="w-full flex-shrink-0" onClick={handleInviteCopy}>
            {copied ? 'Copied!' : 'Invite Friends'}
          </Button>

          {/* Squads row — full-bleed past the scroll container's own padding, same
              technique (leading/trailing spacer flex-items, not paddingLeft/Right on
              the scroller) ChatRoomBrowseSheet's old row used. */}
          <div
            ref={rowRef}
            onScroll={handleScroll}
            className="flex items-stretch overflow-x-auto no-scrollbar nexus-scroll flex-shrink-0"
            style={{
              gap:        CARD_GAP,
              width:      'calc(100% + var(--space-5) * 2)',
              marginLeft: 'calc(var(--space-5) * -1)',
            }}
          >
            <div aria-hidden="true" className="flex-shrink-0" style={{ width: `calc(var(--space-5) - ${CARD_GAP}px)` }} />
            {items.map((item) => {
              if (item.kind === 'create') {
                return (
                  <button
                    key={CREATE_SQUAD_ID}
                    type="button"
                    onClick={() => router.push('/home/create')}
                    className="flex-shrink-0 appearance-none overflow-hidden"
                    style={{ width: CARD_WIDTH }}
                    aria-label="Create Squad"
                  >
                    <div
                      className="flex flex-col items-center justify-center h-full rounded-[var(--x3,8px)]"
                      style={{ gap: 8, border: '1px dashed', borderColor: 'var(--color-border-hover)' }}
                    >
                      <Plus style={{ width: 24, height: 24, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
                      <p
                        className="font-body font-medium text-tertiary text-center truncate w-full"
                        style={{ fontSize: 14, fontVariationSettings: '"opsz" 14', paddingLeft: 12, paddingRight: 12 }}
                      >
                        Create Squad
                      </p>
                    </div>
                  </button>
                )
              }
              const room = item.room
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => { if (!pinLongPressFiredRef.current) handleSelectRoom(room.id) }}
                  onTouchStart={() => handleCardPressStart(room.id)}
                  onTouchEnd={clearCardPressTimer}
                  onTouchMove={clearCardPressTimer}
                  onTouchCancel={clearCardPressTimer}
                  onMouseDown={() => handleCardPressStart(room.id)}
                  onMouseUp={clearCardPressTimer}
                  onMouseLeave={clearCardPressTimer}
                  className="flex-shrink-0 appearance-none text-left active:opacity-80 overflow-hidden"
                  aria-label={`Go to ${room.name}`}
                >
                  <SwipePreviewCard room={room} selected={room.id === crewId} pinned={room.id === pinnedRoomId} />
                </button>
              )
            })}
            <div aria-hidden="true" className="flex-shrink-0" style={{ width: `calc(var(--space-5) - ${CARD_GAP}px)` }} />
          </div>

          <div className="flex items-center justify-center w-full flex-shrink-0">
            <ScrollEqualizerBars items={equalizerItems} currentRoomId={crewId} focusedItemId={focusedItemId} />
          </div>
        </div>

        <div className="flex flex-col w-full flex-shrink-0" style={{ gap: 'var(--space-5)' }}>
          <p
            className="font-body font-bold text-primary leading-none truncate w-full"
            style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}
          >
            Notifications
          </p>
          {notifRoom
            ? <NotificationPreviewCard room={notifRoom} onTap={() => handleSelectRoom(notifRoom.id)} />
            : <NoNotificationsCard />}
        </div>
      </div>

      {pinSheetRoom && (
        <RoomPinSheet
          pinned={pinSheetRoom.id === pinnedRoomId}
          onPin={() => handlePinCrew(pinSheetRoom.id)}
          onLeave={() => requestLeaveSquad({ id: pinSheetRoom.id, name: pinSheetRoom.name, memberCount: pinSheetRoom.memberCount })}
          onClose={() => setPinSheetRoomId(null)}
        />
      )}

      {/* Last-member leave warning — leaving now would delete the whole squad.
          Same markup as ChatInput's own (now-removed) copy of this sheet. */}
      {showLastMemberWarning && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center"
          onClick={() => { if (!leavingSquad) { setShowLastMemberWarning(false); setLeaveTarget(null) } }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-[480px] bg-surface border-t border-border-hover flex flex-col gap-6 p-4"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2">
              <p className="font-pixel text-[8px] text-[#ef4444] leading-none">YOU&apos;RE THE LAST MEMBER</p>
              <div className="flex flex-col gap-1">
                <h2
                  className="font-body font-bold text-[18px] text-primary leading-none"
                  style={{ fontVariationSettings: '"opsz" 14' }}
                >
                  {leaveTarget?.name}
                </h2>
                <p className="font-body text-[12px] text-secondary leading-normal">
                  Leaving will permanently delete this squad — its messages and vibes cannot be recovered.
                </p>
                {leaveError && <p className="font-body text-[12px] text-[#ef4444] leading-normal">{leaveError}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => leaveTarget && void performLeaveSquad(leaveTarget)}
                disabled={leavingSquad}
                className="w-full h-12 flex items-center justify-center bg-[#ef4444] disabled:opacity-50 transition-opacity active:opacity-70"
              >
                <span className="font-pixel text-[8px] text-primary leading-none">
                  {leavingSquad ? '...' : 'DELETE & LEAVE'}
                </span>
              </button>
              <button
                onClick={() => { setShowLastMemberWarning(false); setLeaveTarget(null) }}
                disabled={leavingSquad}
                className="w-full h-12 flex items-center justify-center transition-opacity active:opacity-70"
              >
                <span className="font-pixel text-[8px] text-tertiary leading-none">CANCEL</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </SlidePage>
  )
}
