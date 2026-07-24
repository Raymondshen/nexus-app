import DelayedSkeleton from '@/shared/components/ui/DelayedSkeleton'

// Matches DeveloperUserAnnouncements's own bare-icon header (24x24 icon, gap 8,
// no button hit-box) and its flat surface-sheet card list — not the
// w-6-h-10-hit-box LoadingHeaderSkeleton pattern used by Friends/Inbox/Error Logs.
export default function AnnouncementsLoading() {
  return (
    <DelayedSkeleton>
      <div className="fixed inset-0 bg-black max-w-[480px] mx-auto flex flex-col">
        <div
          className="flex-shrink-0 flex items-center"
          style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)', paddingBottom: 8, gap: 8 }}
        >
          <div className="w-6 h-6 bg-border animate-pulse" />
          <div className="h-4 w-40 bg-border animate-pulse" />
        </div>

        <div className="flex flex-col px-4 pt-4" style={{ gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-col w-full rounded-[8px]"
              style={{ background: 'var(--color-surface-sheet)', padding: 16, gap: 16, animationDelay: `${i * 60}ms` }}
            >
              <div className="flex flex-col w-full" style={{ gap: 8 }}>
                <div className="flex flex-col w-full" style={{ gap: 4 }}>
                  <div className="h-4 w-2/3 bg-border animate-pulse" />
                  <div className="h-3 w-full bg-border animate-pulse" />
                  <div className="h-3 w-4/5 bg-border animate-pulse" />
                </div>
                <div className="h-2 w-1/3 bg-border animate-pulse" />
              </div>
              <div className="flex items-center w-full" style={{ gap: 8 }}>
                <div className="h-2 flex-1 bg-border animate-pulse" />
                <div className="w-12 h-7 rounded-full bg-border animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </DelayedSkeleton>
  )
}
