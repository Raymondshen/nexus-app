import DelayedSkeleton from '@/components/ui/DelayedSkeleton'

export default function MemberProfileLoading() {
  return (
    <div
      className="flex flex-col bg-black"
      style={{ position: 'fixed', top: 0, bottom: 0, left: 0, right: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      <DelayedSkeleton>
        {/* Hero skeleton — matches 280px + safe-area */}
        <div
          className="relative flex-shrink-0 w-full bg-surface overflow-hidden animate-pulse"
          style={{ height: 'calc(280px + env(safe-area-inset-top, 0px))' }}
        >
          {/* Back button placeholder */}
          <div
            className="absolute z-20"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)', left: 16 }}
          >
            <div className="w-8 h-8 bg-border animate-pulse" />
          </div>

          {/* Bottom content placeholder */}
          <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-4 p-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-border animate-pulse flex-shrink-0" />
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="h-2 w-20 bg-border animate-pulse" />
                <div className="h-5 w-36 bg-border animate-pulse" />
                <div className="h-2 w-28 bg-border animate-pulse" />
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <div className="h-2 w-24 bg-border animate-pulse" />
              <div className="h-1 w-full bg-border animate-pulse" />
            </div>
          </div>
        </div>

        {/* Status ticker placeholder */}
        <div className="border-y border-border h-10 bg-black animate-pulse" />

        {/* Body — friend button */}
        <div className="px-4 pt-4">
          <div className="w-full h-12 bg-border animate-pulse" />
        </div>
      </DelayedSkeleton>
    </div>
  )
}
