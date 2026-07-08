'use client'

import Image from 'next/image'
import type { OGPreview } from '@/types'

interface LinkPreviewCardProps {
  preview: OGPreview
}

export function LinkPreviewCard({ preview }: LinkPreviewCardProps) {
  const host = (() => {
    try { return new URL(preview.url).hostname.replace(/^www\./, '') }
    catch { return preview.site_name ?? '' }
  })()

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display:        'block',
        maxWidth:        260,
        borderRadius:    12,
        overflow:       'hidden',
        textDecoration: 'none',
        background:     '#111118',
      }}
    >
      {preview.image && (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', overflow: 'hidden' }}>
          {/* Routed through /api/og-image (same-origin) so next/image can actually
              resize/compress it — external hosts can't be optimized directly. */}
          <Image
            src={`/api/og-image?url=${encodeURIComponent(preview.image)}`}
            alt={preview.title ?? ''}
            fill
            sizes="260px"
            style={{ objectFit: 'cover' }}
            loading="lazy"
          />
        </div>
      )}

      <div style={{ padding: '8px 10px 10px' }}>
        {preview.title && (
          <p
            style={{
              margin:             0,
              fontFamily:        'system-ui, sans-serif',
              fontSize:           13,
              fontWeight:         600,
              color:             '#ffffff',
              lineHeight:        '1.35',
              display:           '-webkit-box',
              WebkitLineClamp:    2,
              WebkitBoxOrient:   'vertical',
              overflow:          'hidden',
              marginBottom:       3,
            }}
          >
            {preview.title}
          </p>
        )}
        <p
          style={{
            margin:       0,
            fontFamily:  'system-ui, sans-serif',
            fontSize:     11,
            color:       'rgba(255,255,255,0.4)',
            lineHeight:  '1.3',
            overflow:    'hidden',
            whiteSpace:  'nowrap',
            textOverflow:'ellipsis',
          }}
        >
          {host}
        </p>
      </div>
    </a>
  )
}
