export default function ChatLoading() {
  return (
    <div
      className="flex flex-col bg-black"
      style={{ position: 'fixed', top: 0, bottom: 0, left: 0, right: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* Header */}
      <div
        className="bg-black border-b border-border px-4 pb-2 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="flex items-center justify-between h-10">
          {/* Left: back + crew name + chevron */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 flex-shrink-0 bg-border animate-pulse" />
            <div className="h-4 w-32 bg-border animate-pulse" />
            <div className="w-4 h-4 flex-shrink-0 bg-border animate-pulse" />
          </div>
          {/* Right: bell + user-plus + vault */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-6 h-6 bg-border animate-pulse" />
            <div className="w-6 h-6 bg-border animate-pulse" />
            <div className="w-6 h-6 bg-border animate-pulse" />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden px-4 py-3 flex flex-col gap-3">
        {[72, 48, 90, 60, 80, 44, 66].map((w, i) => (
          <div
            key={i}
            className={`flex items-end gap-2 ${i % 4 === 0 ? 'pl-10' : ''}`}
          >
            {i % 4 !== 0 && (
              <div className="w-8 h-8 flex-shrink-0 bg-border animate-pulse" />
            )}
            <div
              className="h-8 bg-border animate-pulse"
              style={{ width: `${w}%`, maxWidth: 260, animationDelay: `${i * 70}ms` }}
            />
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        className="bg-black border-t border-border px-4 pt-4 flex-shrink-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
      >
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
  )
}
