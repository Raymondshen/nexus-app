import DelayedSkeleton from '@/components/ui/DelayedSkeleton'

export default function DefinitionsLoading() {
  return (
    <DelayedSkeleton>
      <div className="fixed inset-0 bg-black flex flex-col max-w-[480px] mx-auto">
        {/* Header — no border-b, matches new design */}
        <div className="px-4 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
          <div className="flex items-center h-10 gap-2">
            <div className="w-6 h-6 bg-border animate-pulse" />
            <div className="h-5 w-36 bg-border animate-pulse" />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-4 py-4 flex flex-col gap-6 overflow-hidden">
          {/* Subtitle */}
          <div className="h-4 w-56 bg-border animate-pulse" />

          {/* Definition cards */}
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[rgba(17,17,17,0.5)] border border-[#111111] rounded-[8px] p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-28 bg-border animate-pulse" />
                  <div className="h-4 w-full bg-border animate-pulse" />
                  <div className="h-4 w-3/4 bg-border animate-pulse" />
                </div>
                <div className="h-3 w-24 bg-border animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Footer button */}
        <div className="px-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', paddingTop: 8 }}>
          <div className="h-12 w-full bg-border animate-pulse" />
        </div>
      </div>
    </DelayedSkeleton>
  )
}
