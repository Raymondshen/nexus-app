import DelayedSkeleton from '@/components/ui/DelayedSkeleton'

export default function OnboardingLoading() {
  return (
    <DelayedSkeleton>
    <div className="min-h-screen bg-[#0a0612] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[390px] flex flex-col items-center gap-8">
        {/* Logo placeholder */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-8 bg-[#1a1a2e] animate-pulse" />
          <div className="w-36 h-3 bg-[#1a1a2e] animate-pulse" />
        </div>

        {/* Card placeholder */}
        <div className="w-full bg-[#0f0820] border-2 border-[#2a1545] p-6 flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className="w-40 h-3 bg-[#1a1a2e] animate-pulse" />
            <div className="w-56 h-2 bg-[#1a1a2e] animate-pulse" />
          </div>
          <div className="w-full h-16 bg-[#1a1a2e] animate-pulse" />
          <div className="w-full h-3 bg-[#1a1a2e] animate-pulse opacity-30" />
          <div className="w-full h-16 bg-[#1a1a2e] animate-pulse" />
        </div>
      </div>
    </div>
    </DelayedSkeleton>
  )
}
