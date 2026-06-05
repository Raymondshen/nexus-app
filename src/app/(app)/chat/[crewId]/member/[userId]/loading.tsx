import DelayedSkeleton from '@/components/ui/DelayedSkeleton'

export default function MemberProfileLoading() {
  return (
    <div className="flex flex-col bg-black" style={{ position: 'fixed', top: 0, bottom: 0, left: 0, right: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 pb-2 border-b border-border"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="w-6 h-6 bg-border animate-pulse" />
        <div className="h-3 w-20 bg-border animate-pulse" />
      </div>

      <DelayedSkeleton>
        <div className="flex-1 overflow-y-auto">
          {/* Hero */}
          <div className="flex flex-col items-center pt-10 pb-8 bg-[#0a0612] border-b border-border">
            <div className="w-24 h-24 bg-border animate-pulse" />
            <div className="w-16 h-16 mt-4 bg-border animate-pulse" />
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="h-4 w-36 bg-border animate-pulse" />
              <div className="h-2.5 w-20 bg-border animate-pulse" />
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-[1px] bg-border mt-[1px]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-center py-5 gap-2 bg-black">
                <div className="h-3 w-10 bg-border animate-pulse" />
                <div className="h-2 w-14 bg-border animate-pulse" />
              </div>
            ))}
          </div>

          {/* Friend button */}
          <div className="px-4 pt-6">
            <div className="w-full h-12 bg-border animate-pulse" />
          </div>
        </div>
      </DelayedSkeleton>
    </div>
  )
}
