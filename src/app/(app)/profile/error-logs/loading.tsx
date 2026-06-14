import DelayedSkeleton from '@/components/ui/DelayedSkeleton'

export default function ErrorLogsLoading() {
  return (
    <DelayedSkeleton>
      <div className="min-h-screen bg-black flex flex-col">
        <div
          className="flex items-center gap-3 px-4 pb-3"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
        >
          <div className="w-6 h-10 flex items-center">
            <div className="w-4 h-4 bg-border animate-pulse" />
          </div>
          <div className="h-4 w-28 bg-border animate-pulse" />
        </div>
        <div className="px-4 pt-4 flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-2 p-4"
              style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-2">
                <div className="h-3 w-24 bg-border animate-pulse" />
                <div className="h-2 w-32 bg-surface animate-pulse" />
              </div>
              <div className="h-2 w-full bg-surface animate-pulse" />
              <div className="h-2 w-5/6 bg-surface animate-pulse" />
              <div className="h-2 w-4/6 bg-surface animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </DelayedSkeleton>
  )
}
