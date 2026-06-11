import DelayedSkeleton from '@/components/ui/DelayedSkeleton'

export default function ProfileLoading() {
  return (
    <DelayedSkeleton>
      <div
        className="fixed inset-0 bg-black flex flex-col overflow-hidden"
        style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Hero skeleton — 280px */}
        <div className="relative flex-shrink-0 w-full bg-black overflow-hidden" style={{ height: 280 }}>
          <div className="absolute inset-0 flex flex-col justify-end gap-4 p-4">
            <div className="flex items-center gap-4 w-full">
              <div className="flex-shrink-0 w-14 h-14 bg-border animate-pulse" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-2 w-24 bg-border animate-pulse" />
                <div className="h-5 w-36 bg-border animate-pulse" />
                <div className="h-2 w-32 bg-border animate-pulse" />
              </div>
            </div>
          </div>
          {/* Back button skeleton */}
          <div className="absolute top-4 left-4 w-10 h-10 bg-surface border border-border animate-pulse" />
        </div>

        {/* Body skeleton */}
        <div className="flex-1 overflow-y-hidden flex flex-col gap-6 p-4">
          {/* Edit Profile card */}
          <div className="h-[72px] bg-surface border border-border animate-pulse" />

          {/* Notifications section */}
          <div className="flex flex-col gap-2">
            <div className="h-4 w-28 bg-border animate-pulse" />
            <div className="h-[164px] bg-surface border border-border animate-pulse" />
          </div>

          {/* Account section */}
          <div className="flex flex-col gap-2">
            <div className="h-4 w-20 bg-border animate-pulse" />
            <div className="h-3 w-48 bg-border animate-pulse" />
            <div className="h-12 bg-surface border border-border animate-pulse mt-1" />
          </div>
        </div>
      </div>
    </DelayedSkeleton>
  )
}
