import { formatShortDate } from '@/shared/utils/date'

export interface AnnouncementCardProps {
  title:     string
  text:      string
  /** null renders the Figma 505:2011 gradient "Image here." placeholder — used by the add/edit editor's live preview before an image is chosen. */
  imageUrl:  string | null
  /** null renders a "Date here" placeholder — used by the add/edit editor's live preview for a not-yet-created announcement. */
  createdAt: string | null
}

// Figma 419:1955 / 426:6821 — image container + title/timestamp/body content area.
// Reused by the announcements bottom sheet AND the add/edit announcement editor's
// live preview (Figma 505:2010/505:2001) — keep this the sole place that renders one.
export function AnnouncementCard({ title, text, imageUrl, createdAt }: AnnouncementCardProps) {
  return (
    <div className="w-full flex flex-col items-start overflow-hidden bg-surface-elevated rounded-[8px] flex-shrink-0">
      <div className="w-full h-[180px] flex-shrink-0 overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local static SVG asset, not Supabase storage
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'var(--gradient-nexus)' }}
          >
            <p
              className="font-body font-bold text-primary text-center"
              style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14' }}
            >
              Image here.
            </p>
          </div>
        )}
      </div>
      <div className="w-full flex flex-col p-[var(--space-5)]" style={{ gap: 8 }}>
        <div className="w-full flex items-center leading-none" style={{ gap: 8 }}>
          <p
            className="flex-1 min-w-0 font-body font-bold text-primary truncate"
            style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
          >
            {title || 'Sample title'}
          </p>
          <p
            className="flex-1 min-w-0 font-body font-light text-tertiary text-right whitespace-nowrap"
            style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
          >
            {createdAt ? formatShortDate(createdAt) : 'Date here'}
          </p>
        </div>
        <p
          className="w-full font-body font-normal text-secondary"
          style={{
            fontSize:              'var(--text-sm)',
            lineHeight:            1.5,
            fontVariationSettings: '"opsz" 14',
            whiteSpace:            'pre-wrap',
            overflowWrap:          'break-word',
          }}
        >
          {text || 'Sample preview'}
        </p>
      </div>
    </div>
  )
}
