import DelayedSkeleton from '@/shared/components/ui/DelayedSkeleton'

export default function FriendsLoading() {
  return (
    <DelayedSkeleton>
    <div className="min-h-screen bg-black flex flex-col">
      <div
        className="flex items-center gap-4 px-4 pb-4 border-b border-border"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}
      >
        <div className="w-6 h-10 flex items-center">
          <div className="w-4 h-4 bg-border animate-pulse" />
        </div>
        <div className="h-3 w-20 bg-border animate-pulse" />
      </div>

      <div className="px-4 pt-4">
        <div className="h-10 bg-surface border border-border animate-pulse" />
      </div>

      <div className="flex border-b border-border mt-4">
        <div className="flex-1 py-3 flex justify-center">
          <div className="h-2 w-16 bg-border animate-pulse" />
        </div>
        <div className="flex-1 py-3 flex justify-center">
          <div className="h-2 w-16 bg-border animate-pulse" />
        </div>
      </div>

      <div className="px-4 flex flex-col divide-y divide-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="w-10 h-10 bg-surface animate-pulse flex-shrink-0" />
            <div className="flex-1 h-3 bg-surface animate-pulse" />
          </div>
        ))}
      </div>
    </div>
    </DelayedSkeleton>
  )
}
