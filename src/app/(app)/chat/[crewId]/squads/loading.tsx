import DelayedSkeleton from '@/shared/components/ui/DelayedSkeleton'

export default function SquadsLoading() {
  return (
    <DelayedSkeleton>
      <div className="fixed inset-0 bg-black flex flex-col max-w-[480px] mx-auto">
        {/* Header */}
        <div className="px-4 pb-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
          <div className="flex items-center justify-between h-10">
            <div className="h-4 w-20 bg-border animate-pulse" />
            <div className="w-6 h-6 bg-border animate-pulse" />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-4 flex flex-col gap-4 overflow-hidden">
          {/* Invite Friends button */}
          <div className="h-12 w-full bg-border animate-pulse" />

          {/* Squads row */}
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-3 flex-shrink-0" style={{ width: 180 }}>
                <div className="h-[120px] w-full bg-border animate-pulse" />
                <div className="h-4 w-28 bg-border animate-pulse" />
                <div className="h-3 w-16 bg-border animate-pulse" />
              </div>
            ))}
          </div>

          {/* Equalizer bars */}
          <div className="flex items-end justify-center gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="w-[2px] h-2 bg-border animate-pulse" />
            ))}
          </div>

          {/* Notifications */}
          <div className="h-4 w-28 bg-border animate-pulse" />
          <div className="h-16 w-full bg-border animate-pulse" />
        </div>
      </div>
    </DelayedSkeleton>
  )
}
