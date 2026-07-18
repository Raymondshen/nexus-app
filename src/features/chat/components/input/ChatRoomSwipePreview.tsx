'use client'

import { useState } from 'react'
import { motion, AnimatePresence, useMotionValueEvent } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import { useChatRoomPeekStore, type RoomMeta } from '@/features/chat/store/chatRoomPeekStore'
import { Check } from 'pixelarticons/react/Check'
import { Message } from 'pixelarticons/react/Message'

// ─── ChatRoomSwipePreview (Figma 577:4895 "body") ──────────────────────────────
// Shown mid room-swipe drag (ChatInput's isRoomSwiping) — one `position: fixed`
// region spanning from the top of the screen down to the top of the real input box
// (bottom: chatInputHeight, same measurement ChatRoomPeekLayer uses to inset its own
// ghost preview), giving a quick visual hint of which room a continued swipe would
// land on. This single region is BOTH the dark scrim over the message log (`bg-black/60`,
// same tone as the kick-confirmation sheet's backdrop elsewhere in ChatInput) AND the
// flex container bottom-aligning its own content (name/equalizer header + card row)
// inside it, per Figma's own "Body" node (`flex flex-col items-center justify-end
// size-full`). `pointerEvents: none` throughout — this never intercepts touches; the
// drag it's reacting to is owned by ChatSquadDetailBar.
//
// Always up to 3 room cards in fixed, direction-independent chatRoomOrder position —
// previous room, this room, next room, always in that left-to-right order — never
// reshuffled by which way the drag is heading. Either end can be absent at a
// chatRoomOrder boundary, in which case fewer than 3 render. Unlike the previous
// revision of this component, cards are all the SAME fixed size (matching this Figma
// frame exactly — all 3 cards are 180px regardless of selection); "selected" is
// conveyed by border color only (purple vs the default border-hover), not by scaling.
//
// `selectedRole` — which room is "selected" (purple border + name shown in the header
// above) — starts on 'current' and flips to 'prev'/'next' once `dragT` crosses ±0.5
// (past the halfway point toward that neighbor). The header name crossfades
// (AnimatePresence, mode="wait") as selection changes. This selection behavior isn't
// Figma motion data (get_motion_context returned no animated nodes for this revision —
// unlike the prior one, this frame has none at all) — it's this component's own
// interactive behavior per explicit request, and the header/card fade-in-out are its
// own plain, quick transitions rather than anything sourced from Figma.
//
// Each card's rich data (cover photo, avatar, level, member count, online members,
// unread count, last-message preview) comes from chatRoomPeekStore's `RoomMeta` — for
// the room actually open, ChatInput's own "publish own meta" effect keeps this live;
// for prev/next, `ensureRoomMeta` does a one-shot fetch (crews columns + a user_presence
// snapshot + get_unread_counts) the first time either is peeked. The equalizer-style bar
// icon next to the name is a static decorative element (Figma 582:3452) — nothing in
// this design or the surrounding feature ties it to any live data, so it isn't
// data-bound here either.
const SELECTION_THRESHOLD = 0.5
const FADE_S = 0.08

export interface SwipePreviewRoom extends RoomMeta {
  id:   string
  role: 'prev' | 'current' | 'next'
}

interface ChatRoomSwipePreviewProps {
  visible: boolean
  rooms:   SwipePreviewRoom[]
  // Signed room-swipe drag progress, -1..1 (see ChatInput's swipeDragT) — 0 at rest
  // (current selected); negative while dragging toward the next room, positive toward
  // the previous room. Only ever drives `selectedRole` here (a MotionValue rather than
  // a number prop so ChatInput itself isn't re-rendered on every drag frame — see that
  // component's own doc comment on swipeDragT).
  dragT: MotionValue<number>
}

export function ChatRoomSwipePreview({ visible, rooms, dragT }: ChatRoomSwipePreviewProps) {
  // Same live-measured squad-bar+input height ChatRoomPeekLayer already insets its own
  // ghost preview by (see that store field's own doc comment) — reused here so this
  // region's bottom edge lines up exactly with the top of the real input box instead of
  // running underneath it.
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)

  // Which room is selected — updates only on threshold crossing (not every drag
  // frame), so this is plain React state rather than another MotionValue: a selection
  // swap is a rare, discrete event, not a 60fps visual.
  const [selectedRole, setSelectedRole] = useState<SwipePreviewRoom['role']>('current')
  useMotionValueEvent(dragT, 'change', (v) => {
    const next = v <= -SELECTION_THRESHOLD ? 'next' : v >= SELECTION_THRESHOLD ? 'prev' : 'current'
    setSelectedRole((prev) => (prev === next ? prev : next))
  })
  // Reset to 'current' at the start of every fresh gesture — `dragT` resets to 0 too
  // (ChatInput's handleTopPanStart), but without this, a gesture that last ended
  // selected on prev/next would keep showing that stale selection for an instant
  // before the next drag's own movement corrects it. Adjusted during render (the "you
  // might not need an effect" pattern), not in a useEffect — this only reacts to
  // `visible` transitioning, not to every render, since `prevVisible` is only updated
  // here too.
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) setSelectedRole('current')
  }

  const selectedRoom = rooms.find((r) => r.role === selectedRole) ?? rooms.find((r) => r.role === 'current')

  return (
    <AnimatePresence>
      {visible && rooms.length > 0 && (
        <motion.div
          key="room-swipe-preview"
          className="fixed left-0 right-0 top-0 bg-black/60 flex flex-col items-center justify-end"
          style={{
            bottom:        chatInputHeight,
            maxWidth:      480,
            marginLeft:    'auto',
            marginRight:   'auto',
            gap:           'var(--space-5)',
            paddingLeft:   'var(--space-5)',
            paddingRight:  'var(--space-5)',
            paddingTop:    'var(--space-5)',
            paddingBottom: 'var(--space-5)',
            pointerEvents: 'none',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: FADE_S } }}
          exit={{ opacity: 0, transition: { duration: FADE_S } }}
        >
          <div className="flex items-center justify-between w-full">
            {selectedRoom && (
              <AnimatePresence mode="wait">
                <motion.p
                  key={selectedRoom.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="font-silkscreen text-primary leading-none truncate min-w-0"
                  style={{ fontSize: 'var(--text-md)' }}
                >
                  {selectedRoom.name}
                </motion.p>
              </AnimatePresence>
            )}
            <EqualizerBars />
          </div>

          <div className="flex items-center" style={{ gap: 16 }}>
            {rooms.map((room) => (
              <SwipePreviewCard key={room.id} room={room} selected={room.role === selectedRole} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Static decorative bar-graph icon (Figma 582:3452) — 7 fixed-height/color bars, no
// data binding (see this file's top doc comment).
const EQUALIZER_BARS = [
  { height: 8,  color: 'var(--color-muted)' },
  { height: 8,  color: 'var(--color-muted)' },
  { height: 8,  color: 'var(--color-muted)' },
  { height: 16, color: 'var(--color-purple)' },
  { height: 8,  color: 'var(--red)' },
  { height: 8,  color: 'var(--color-muted)' },
  { height: 8,  color: 'var(--color-muted)' },
] as const

function EqualizerBars() {
  return (
    <div className="flex items-end flex-shrink-0" style={{ gap: 8 }}>
      {EQUALIZER_BARS.map((bar, i) => (
        <div key={i} style={{ width: 2, height: bar.height, background: bar.color }} />
      ))}
    </div>
  )
}

// One 180px squad card (Figma 582:2892 default / 582:3150 selected) — cover photo +
// gradient + small avatar, name/level/member-count, up to 4 online-member avatars, and
// a status footer. Border color is the only thing that changes on selection; layout
// and size are otherwise identical to the unselected state, matching this Figma frame
// (all 3 cards are the same size). Markup/tokens mirror `UserCard.tsx` (the sole other
// "180px crew-ish card with a cover header" in the app) rather than reinventing this
// shape: same width/radius/border tokens, same supabaseImageLoader + `--gradient-
// image-overlay` cover treatment, same online-dot styling.
//
// Exported for ChatRoomBrowseSheet (the swipe-up "browse every room" overlay), which
// reuses this exact card so both surfaces read as one family. That caller only has a
// plain `RoomMeta` + id (no `role` — a full room list has no fixed prev/current/next
// slots), hence the prop type here is the looser `RoomMeta & { id: string }` rather
// than the stricter `SwipePreviewRoom` this file's own 3-card row happens to pass.
export function SwipePreviewCard({ room, selected }: { room: RoomMeta & { id: string }; selected: boolean }) {
  const onlineMembers = room.onlineMembers.slice(0, 4)
  const hasUnread     = room.unreadCount > 0

  return (
    <div
      className="bg-black flex flex-col flex-shrink-0 overflow-hidden rounded-[var(--x3,8px)]"
      style={{ width: 180, border: '1px solid', borderColor: selected ? 'var(--color-purple)' : 'var(--color-border-hover)' }}
    >
      <div className="relative flex-shrink-0 w-full overflow-hidden" style={{ height: 120 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed cover fill, same pattern as UserCard/ProfileHeroBackground */}
        <img
          src={supabaseImageLoader({ src: room.backgroundImageUrl ?? '/img/default_image.png', width: 360, quality: 90 })}
          alt=""
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--gradient-image-overlay)' }} />
        <div className="absolute" style={{ left: 12, bottom: 12 }}>
          <GroupAvatar imageUrl={room.imageUrl} name={room.name} size={32} />
        </div>
      </div>

      <div className="flex flex-col w-full flex-shrink-0" style={{ padding: 12, gap: 8 }}>
        <div className="flex flex-col" style={{ gap: 4 }}>
          <p className="font-body font-bold text-secondary truncate leading-none" style={{ fontSize: 16, fontVariationSettings: '"opsz" 14' }}>
            {room.name}
          </p>
          <p className="font-silkscreen text-tertiary leading-none" style={{ fontSize: 'var(--text-mini)' }}>
            Lv.{room.level} · {room.memberCount} member
          </p>
        </div>
        {onlineMembers.length > 0 && (
          <div className="flex items-center" style={{ gap: 8 }}>
            {onlineMembers.map((m) => (
              <div key={m.id} className="relative flex-shrink-0">
                <UserAvatar avatarUrl={m.avatarUrl} username={m.username} size={24} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="flex items-center border-t border-b border-border flex-shrink-0"
        style={{ gap: 8, paddingLeft: 8, paddingRight: 8, paddingTop: 12, paddingBottom: 12 }}
      >
        {hasUnread ? (
          <>
            <Message style={{ width: 8, height: 8, color: 'var(--red)', flexShrink: 0 }} aria-hidden="true" />
            <p className="font-silkscreen leading-none truncate" style={{ fontSize: 'var(--text-mini)', color: 'var(--red)' }}>
              {room.unreadCount} unread message{room.unreadCount === 1 ? '' : 's'}
            </p>
          </>
        ) : (
          <>
            <Check style={{ width: 8, height: 8, color: 'var(--color-muted)', flexShrink: 0 }} aria-hidden="true" />
            <p className="font-silkscreen text-muted leading-none truncate" style={{ fontSize: 'var(--text-mini)' }}>
              {room.lastMessagePreview || 'Nothing new'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
