// Shared placeholder "chat bubble" rows for wherever a message log needs a generic
// loading skeleton instead of real content: chat/[crewId]/loading.tsx's route-level
// fallback (a fresh navigation with nothing on screen yet) and ChatRoomPeekLayer's
// swipe-nav preview (deliberately a generic skeleton, not a stale cached snapshot of
// the destination room's real messages — a real-but-possibly-wrong preview read as a
// glitch, not a loading state; see that component's doc comment). A fixed, hand-picked
// width/order pattern (not randomized per mount) so the skeleton reads identically
// every time instead of jittering.
const ROW_WIDTHS = [72, 48, 90, 60, 80, 44, 66]

export function ChatMessageSkeletonRows() {
  return (
    <>
      {ROW_WIDTHS.map((w, i) => (
        <div key={i} className={`flex items-end gap-2 ${i % 4 === 0 ? 'pl-10' : ''}`}>
          {i % 4 !== 0 && (
            <div className="w-8 h-8 flex-shrink-0 bg-border animate-pulse" />
          )}
          <div
            className="h-8 bg-border animate-pulse"
            style={{ width: `${w}%`, maxWidth: 260, animationDelay: `${i * 70}ms` }}
          />
        </div>
      ))}
    </>
  )
}
