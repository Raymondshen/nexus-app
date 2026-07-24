// Shared skeleton for the "bare-icon" back-button + title header pattern used
// by Friends, Friends Inbox, and Error Logs (their live BackButton components
// all render a 24x24 ChevronLeft in a `w-6 h-10` hit box next to a title).
// Consolidates 3 near-identical inline copies in the route loading.tsx files
// that had drifted on gap/padding/title size.
export default function LoadingHeaderSkeleton({
  titleWidth = 'w-20',
  withBorder = false,
}: {
  titleWidth?: string
  withBorder?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 pb-3${withBorder ? ' border-b border-border' : ''}`}
      style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
    >
      <div className="w-6 h-10 flex items-center">
        <div className="w-4 h-4 bg-border animate-pulse" />
      </div>
      <div className={`h-4 ${titleWidth} bg-border animate-pulse`} />
    </div>
  )
}
