export default function ChatLoading() {
  return (
    <div
      className="flex flex-col bg-[#0a0612]"
      style={{ height: '100dvh', maxWidth: 480, margin: '0 auto', overflow: 'hidden' }}
    >
      {/* Header skeleton */}
      <div
        className="px-4 pb-3 border-b border-[#1a1a2e] flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="h-3 w-28 bg-[#1a1a2e] animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="h-3 w-8 bg-[#1a1a2e] animate-pulse" />
            <div className="h-5 w-14 bg-[#1a1a2e] animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 mb-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-7 h-7 bg-[#1a1a2e] animate-pulse" />
          ))}
        </div>
        <div className="h-1.5 w-full bg-[#1a1a2e] animate-pulse mb-3" />
      </div>

      {/* Message skeletons */}
      <div className="flex-1 overflow-hidden px-4 py-3 flex flex-col gap-3">
        {[80, 55, 100, 65, 90, 45, 75].map((w, i) => (
          <div
            key={i}
            className={`flex items-end gap-2 ${i % 3 === 0 ? 'flex-row-reverse' : ''}`}
          >
            <div className="w-7 h-7 rounded-none bg-[#1a1a2e] animate-pulse flex-shrink-0" />
            <div
              className="h-9 bg-[#1a1a2e] animate-pulse"
              style={{ width: `${w}%`, maxWidth: 260, animationDelay: `${i * 80}ms` }}
            />
          </div>
        ))}
      </div>

      {/* Input skeleton */}
      <div className="border-t border-[#1a1a2e] bg-[#080514] px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <div className="w-10 h-10 bg-[#1a1a2e] animate-pulse" />
        <div className="flex-1 h-10 bg-[#1a1a2e] animate-pulse" />
        <div className="w-10 h-10 bg-[#1a1a2e] animate-pulse" />
        <div className="w-10 h-10 bg-[#1a1a2e] animate-pulse" />
      </div>

      {/* BottomNav skeleton */}
      <div
        className="flex border-t border-[#1a1a2e] bg-[#080514] flex-shrink-0"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {[0, 1].map((i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-center gap-1 py-3" style={{ minHeight: 56 }}>
            <div className="w-5 h-5 bg-[#1a1a2e] animate-pulse" />
            <div className="w-8 h-2 bg-[#1a1a2e] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
