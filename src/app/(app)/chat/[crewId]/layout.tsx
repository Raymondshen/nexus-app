import { ChatRoomPeekLayer } from '@/features/chat/components/navigation/ChatRoomPeekLayer'

// A layout at this exact segment level persists across navigations between two
// `/chat/[crewId]` routes (even though the crewId param changes) — Next.js doesn't
// remount a layout just because a dynamic segment value changed, only page.tsx
// (and everything inside it) does. ChatRoomPeekLayer relies on exactly that: it
// needs to stay mounted *through* a room-to-room navigation to show a preview of
// the destination room while the outgoing room's page.tsx is still sliding away.
// See ChatRoomPeekLayer's own doc comment for the full picture.
export default function ChatRoomLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ChatRoomPeekLayer />
      {children}
    </>
  )
}
