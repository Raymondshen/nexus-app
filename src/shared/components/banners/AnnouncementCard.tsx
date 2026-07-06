function formatAnnouncementDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

export interface AnnouncementCardProps {
  title:     string
  text:      string
  imageUrl:  string
  createdAt: string
}

// Figma 419:1955 / 426:6821 — image container + title/timestamp/body content area.
// Reused by the announcements bottom sheet; keep this the sole place that renders one.
export function AnnouncementCard({ title, text, imageUrl, createdAt }: AnnouncementCardProps) {
  return (
    <div className="w-full flex flex-col items-start overflow-hidden bg-surface-elevated rounded-[8px] flex-shrink-0">
      <div className="w-full h-[180px] flex-shrink-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- local static SVG asset, not Supabase storage */}
        <img
          src={imageUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
      </div>
      <div className="w-full flex flex-col p-[var(--space-5)]" style={{ gap: 8 }}>
        <div className="w-full flex items-center leading-none" style={{ gap: 8 }}>
          <p
            className="flex-1 min-w-0 font-body font-bold text-primary truncate"
            style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
          >
            {title}
          </p>
          <p
            className="flex-1 min-w-0 font-body font-light text-tertiary text-right whitespace-nowrap"
            style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
          >
            {formatAnnouncementDate(createdAt)}
          </p>
        </div>
        <p
          className="w-full font-body font-normal text-secondary"
          style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5, fontVariationSettings: '"opsz" 14' }}
        >
          {text}
        </p>
      </div>
    </div>
  )
}
