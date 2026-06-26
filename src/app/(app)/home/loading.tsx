import DelayedSkeleton from '@/shared/components/ui/DelayedSkeleton'

export default function HomeLoading() {
  return (
    <DelayedSkeleton>
    <div className="min-h-screen bg-black flex flex-col">

      {/* Header */}
      <div
        className="border-b border-border px-4 pb-2 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="flex items-center justify-between h-10">
          <div className="h-4 w-16 bg-border animate-pulse" />
          <div className="flex items-center gap-4">
            <div className="w-6 h-6 bg-border animate-pulse" />
            <div className="w-6 h-6 bg-border animate-pulse" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-6">

        {/* Profile banner */}
        <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex-shrink-0 bg-border animate-pulse" />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-2 w-20 bg-border animate-pulse" />
              <div className="h-4 w-28 bg-border animate-pulse" />
              <div className="h-2 w-24 bg-border animate-pulse" />
            </div>
            <div className="w-4 h-4 bg-border animate-pulse self-start" />
          </div>
          {/* AFK XP bar */}
          <div className="flex items-stretch gap-2">
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-2 w-36 bg-border animate-pulse" />
              <div className="h-1 w-full bg-border animate-pulse" />
            </div>
            <div className="w-16 h-8 bg-border animate-pulse" />
          </div>
        </div>

        {/* Squads section */}
        <div className="flex flex-col gap-4">
          <div className="h-3 w-12 bg-border animate-pulse" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 pr-2"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="w-10 h-10 flex-shrink-0 bg-border animate-pulse" />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {/* XP / level row */}
                <div className="h-2 w-28 bg-border animate-pulse" />
                {/* Name + timestamp row */}
                <div className="flex items-center gap-2">
                  <div className="h-3 flex-1 bg-border animate-pulse" />
                  <div className="h-2 w-8 flex-shrink-0 bg-border animate-pulse" />
                </div>
                {/* Preview row */}
                <div className="h-2 w-40 bg-border animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </DelayedSkeleton>
  )
}
