import DelayedSkeleton from '@/components/ui/DelayedSkeleton'

export default function VaultLoading() {
  return (
    <DelayedSkeleton>
    <div
      className="flex flex-col bg-[#0a0612] min-h-screen"
      style={{ maxWidth: 480, margin: '0 auto' }}
    >
      {/* Header skeleton */}
      <div
        className="px-4 pb-4 border-b border-[#1a1a2e]"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
      >
        <div className="h-3 w-20 bg-[#1a1a2e] animate-pulse mb-2" />
        <div className="h-4 w-36 bg-[#1a1a2e] animate-pulse mb-1" />
        <div className="h-2 w-24 bg-[#1a1a2e] animate-pulse" />
      </div>

      {/* Artifact grid skeleton */}
      <div className="px-4 py-4 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="border border-[#1a1a2e] p-4 animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-[#1a1a2e]" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-3 w-32 bg-[#1a1a2e]" />
                <div className="h-2 w-20 bg-[#1a1a2e]" />
                <div className="h-2 w-48 bg-[#1a1a2e]" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BottomNav skeleton */}
      <div
        className="fixed bottom-0 left-0 right-0 flex border-t border-[#1a1a2e] bg-[#080514]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', maxWidth: 480, margin: '0 auto' }}
      >
        {[0, 1].map((i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-center gap-1 py-3" style={{ minHeight: 56 }}>
            <div className="w-5 h-5 bg-[#1a1a2e] animate-pulse" />
            <div className="w-8 h-2 bg-[#1a1a2e] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
    </DelayedSkeleton>
  )
}
