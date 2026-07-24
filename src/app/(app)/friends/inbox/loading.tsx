import DelayedSkeleton from '@/shared/components/ui/DelayedSkeleton'
import LoadingHeaderSkeleton from '@/shared/components/ui/LoadingHeaderSkeleton'

export default function InboxLoading() {
  return (
    <DelayedSkeleton>
      <div className="min-h-screen bg-black flex flex-col">
        <LoadingHeaderSkeleton titleWidth="w-16" withBorder />

        <div className="px-4 pt-4 flex flex-col gap-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-4 p-4"
              style={{ background: 'rgba(17,17,17,0.5)', border: '1px solid #111', borderRadius: 8, animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-border animate-pulse flex-shrink-0" />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="h-3 w-28 bg-border animate-pulse" />
                  <div className="h-2 w-36 bg-surface animate-pulse" />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1 h-10 bg-border animate-pulse" />
                <div className="flex-1 h-10 bg-surface animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </DelayedSkeleton>
  )
}
