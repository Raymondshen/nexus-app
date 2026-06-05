import DelayedSkeleton from '@/components/ui/DelayedSkeleton'

export default function ProfileLoading() {
  return (
    <DelayedSkeleton>
    <div className="min-h-screen bg-[#0a0612] flex flex-col">
      {/* Header skeleton */}
      <div
        className="flex items-center gap-3 px-4 pb-3 border-b border-[#1a1a2e]"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <div className="w-9 h-9 bg-[#1a1a2e] animate-pulse" />
        <div className="h-3 w-20 bg-[#1a1a2e] animate-pulse" />
      </div>

      <div className="flex-1 px-4 py-6 flex flex-col gap-6 max-w-[480px] w-full mx-auto">
        {/* Avatar skeleton */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 bg-[#1a1a2e] animate-pulse" />
          <div className="h-2 w-32 bg-[#1a1a2e] animate-pulse" />
        </div>

        {/* Username section skeleton */}
        <div>
          <div className="h-2 w-24 bg-[#1a1a2e] animate-pulse mb-3" />
          <div className="h-12 bg-[#1a1a2e] animate-pulse" />
        </div>

        {/* Notifications section skeleton */}
        <div>
          <div className="h-2 w-28 bg-[#1a1a2e] animate-pulse mb-3" />
          <div className="h-20 bg-[#1a1a2e] animate-pulse" />
        </div>

        {/* Account section skeleton */}
        <div>
          <div className="h-2 w-20 bg-[#1a1a2e] animate-pulse mb-3" />
          <div className="h-12 bg-[#1a1a2e] animate-pulse" />
        </div>
      </div>
    </div>
    </DelayedSkeleton>
  )
}
