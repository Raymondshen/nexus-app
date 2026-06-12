import DelayedSkeleton from '@/components/ui/DelayedSkeleton'

export default function DefinitionsLoading() {
  return (
    <DelayedSkeleton>
      <div className="fixed inset-0 bg-black flex flex-col max-w-[480px] mx-auto">
        {/* Header */}
        <div className="border-b border-border px-4 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
          <div className="flex items-center h-10 gap-2">
            <div className="w-6 h-6 bg-border animate-pulse" />
            <div className="h-4 w-40 bg-border animate-pulse" />
          </div>
        </div>

        {/* Definition cards */}
        <div className="flex-1 px-4 py-4 flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface border border-border p-4 flex flex-col gap-2">
              <div className="h-3 w-24 bg-border animate-pulse" />
              <div className="h-4 w-full bg-border animate-pulse" />
              <div className="h-4 w-3/4 bg-border animate-pulse" />
            </div>
          ))}
        </div>

        {/* Footer button */}
        <div className="px-4 pt-3 border-t border-border" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
          <div className="h-12 w-full bg-border animate-pulse" />
        </div>
      </div>
    </DelayedSkeleton>
  )
}
