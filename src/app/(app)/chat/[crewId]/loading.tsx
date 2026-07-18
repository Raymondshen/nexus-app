'use client'

import { useParams } from 'next/navigation'
import DelayedSkeleton from '@/shared/components/ui/DelayedSkeleton'
import { useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'
import { ChatMessageSkeletonRows } from '@/features/chat/components/messages/ChatMessageSkeletonRows'

// Next.js's Suspense fallback for this route segment — shown while ChatPage's server
// component is fetching its data (crew/members/notes/etc., several queries — see
// chat/[crewId]/page.tsx), which commonly runs well past DelayedSkeleton's ~300ms
// grace period. That's the right behavior for a normal navigation into this room
// (tapping in from Home, a direct link, back-nav) where there's nothing else on
// screen yet.
//
// But when this navigation is the destination of a committed chat-swipe-nav gesture,
// ChatRoomPeekLayer (chat/[crewId]/layout.tsx, a persistent sibling of this route
// tree) has ALREADY revealed its own message-log skeleton for this exact room, frozen
// at rest, specifically so there's no blank/loading flash while navigation completes —
// see its own doc comment. Mounting a second, independent skeleton on top of that would
// undo the whole point of that preview: a jarring "peek skeleton → this skeleton → real
// page" three-stage flicker (each one's pulse animation runs on its own clock, so the
// two would visibly desync) instead of a single continuous "peek skeleton → real page".
// So this defers to the peek layer's already-frozen skeleton in that case, by reading
// the same chatRoomPeekStore state ChatInput/ChatRoomPeekLayer already coordinate through —
// `peek.phase` only stays 'committing' for this exact target crew until the real
// ChatInput below mounts and clears it (see ChatRoomPeekLayer's own effect).
export default function ChatLoading() {
  const { crewId } = useParams<{ crewId: string }>()
  const peek = useChatRoomPeekStore((s) => s.peek)
  if (peek && peek.phase === 'committing' && peek.targetCrewId === crewId) return null

  return (
    <DelayedSkeleton>
    <div
      className="flex flex-col bg-black"
      style={{ position: 'fixed', top: 0, bottom: 0, left: 0, right: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* Messages */}
      <div className="flex-1 overflow-hidden px-4 py-3 flex flex-col gap-3">
        <ChatMessageSkeletonRows />
      </div>

      {/* Input */}
      <div
        className="bg-black border-t border-border px-4 pt-4 flex-shrink-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
      >
        {/* Crew name row */}
        <div className="flex items-center gap-1 mb-2">
          <div className="h-3 w-20 bg-border animate-pulse" />
          <div className="h-2 w-16 bg-border animate-pulse" />
        </div>
        {/* Member avatars row */}
        <div className="flex items-center gap-3 mb-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-6 h-6 bg-border animate-pulse flex-shrink-0" />
          ))}
        </div>
        {/* XP stats + progress bar */}
        <div className="flex flex-col gap-2 mb-4">
          <div className="h-2 w-48 bg-border animate-pulse" />
          <div className="h-1 w-full bg-border animate-pulse" />
        </div>
        {/* Input box */}
        <div className="border border-border h-12 flex items-center px-4 gap-3">
          <div className="flex-1 h-4 bg-border animate-pulse" />
          <div className="w-4 h-4 bg-border animate-pulse flex-shrink-0" />
        </div>
      </div>
    </div>
    </DelayedSkeleton>
  )
}
