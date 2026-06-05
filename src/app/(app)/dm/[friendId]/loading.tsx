export default function DMLoading() {
  return (
    <div
      className="flex flex-col bg-black"
      style={{ height: '100dvh', maxWidth: 480, margin: '0 auto', overflow: 'hidden' }}
    >
      {/* Header skeleton */}
      <div
        className="px-4 pb-4 border-b border-border flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <div className="flex items-center h-10 gap-3">
          <div className="w-6 h-6 bg-border animate-pulse flex-shrink-0" />
          <div className="w-8 h-8 bg-border animate-pulse flex-shrink-0" />
          <div className="flex flex-col gap-1.5">
            <div className="h-3 w-28 bg-border animate-pulse" />
            <div className="h-2 w-12 bg-border animate-pulse" />
          </div>
        </div>
      </div>

      {/* Message skeletons */}
      <div className="flex-1 overflow-hidden px-4 py-3 flex flex-col gap-3">
        {[80, 55, 100, 65, 90, 45].map((w, i) => (
          <div
            key={i}
            className={`flex items-end gap-2 ${i % 3 === 0 ? 'flex-row-reverse' : ''}`}
          >
            <div className="w-7 h-7 bg-border animate-pulse flex-shrink-0" />
            <div
              className="h-9 bg-border animate-pulse"
              style={{ width: `${w}%`, maxWidth: 260, animationDelay: `${i * 80}ms` }}
            />
          </div>
        ))}
      </div>

      {/* Input skeleton */}
      <div className="border-t border-border bg-black px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <div className="w-10 h-10 bg-border animate-pulse" />
        <div className="flex-1 h-10 bg-border animate-pulse" />
        <div className="w-10 h-10 bg-border animate-pulse" />
      </div>
    </div>
  )
}
