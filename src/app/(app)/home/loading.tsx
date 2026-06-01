export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-[#0a0612] flex flex-col">
      {/* Header skeleton */}
      <div
        className="flex items-center justify-between px-4 border-b border-[#1a1a2e]"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingBottom: 12 }}
      >
        <div className="h-4 w-16 bg-[#1a1a2e] animate-pulse" />
        <div className="flex gap-2">
          <div className="w-8 h-8 bg-[#1a1a2e] animate-pulse" />
          <div className="w-8 h-8 bg-[#1a1a2e] animate-pulse" />
        </div>
      </div>

      {/* Section label skeleton */}
      <div className="px-4 py-2 border-b border-[#1a1a2e]">
        <div className="h-2 w-24 bg-[#1a1a2e] animate-pulse" />
      </div>

      {/* Crew card skeletons */}
      <div className="flex flex-col">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="px-4 py-3.5 flex items-center gap-3 border-b border-[#1a1a2e]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="w-11 h-11 bg-[#1a1a2e] animate-pulse flex-shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex justify-between">
                <div className="h-3 w-28 bg-[#1a1a2e] animate-pulse" />
                <div className="h-2 w-10 bg-[#1a1a2e] animate-pulse" />
              </div>
              <div className="h-2 w-48 bg-[#1a1a2e] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
