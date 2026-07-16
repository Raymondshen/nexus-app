import { NexusWordmark } from '@/shared/components/ui/NexusWordmark'

// Suspense fallback for /home while the server component awaits crews +
// message previews. Renders the same wordmark HomeLoadingGate shows on mount,
// so the swap from this fallback into HomeClient's own splash is pixel-
// identical (invisible) — HomeLoadingGate's fade-out is what the user sees.
export default function HomeLoading() {
  return (
    <div className="h-screen w-full bg-black flex items-center justify-center">
      <NexusWordmark />
    </div>
  )
}
