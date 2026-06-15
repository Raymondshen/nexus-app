'use client'

import Image from 'next/image'
import type { OGPreview } from '@/types'

interface LinkPreviewCardProps {
  preview: OGPreview
}

export function LinkPreviewCard({ preview }: LinkPreviewCardProps) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display:        'block',
        maxWidth:        280,
        border:         '1px solid rgba(191,95,255,0.2)',
        borderRadius:    8,
        overflow:       'hidden',
        textDecoration: 'none',
      }}
    >
      {preview.image && (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden' }}>
          <Image
            src={preview.image}
            alt={preview.title ?? ''}
            fill
            sizes="280px"
            style={{ objectFit: 'cover' }}
            loading="lazy"
            unoptimized
          />
        </div>
      )}

      <div style={{ background: '#1a1025', padding: 8 }}>
        {preview.site_name && (
          <p
            style={{
              margin:       0,
              marginBottom: 2,
              fontFamily:  'system-ui, sans-serif',
              fontSize:     9,
              color:       'rgba(255,255,255,0.4)',
              lineHeight:  '1.4',
              overflow:    'hidden',
              whiteSpace:  'nowrap',
              textOverflow:'ellipsis',
            }}
          >
            {preview.site_name}
          </p>
        )}
        {preview.title && (
          <p
            style={{
              margin:             0,
              fontFamily:        'system-ui, sans-serif',
              fontSize:           12,
              color:             '#ffffff',
              lineHeight:        '1.4',
              display:           '-webkit-box',
              WebkitLineClamp:    2,
              WebkitBoxOrient:   'vertical',
              overflow:          'hidden',
            }}
          >
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p
            style={{
              margin:             0,
              marginTop:          2,
              fontFamily:        'system-ui, sans-serif',
              fontSize:           11,
              color:             'rgba(255,255,255,0.5)',
              lineHeight:        '1.4',
              display:           '-webkit-box',
              WebkitLineClamp:    2,
              WebkitBoxOrient:   'vertical',
              overflow:          'hidden',
            }}
          >
            {preview.description}
          </p>
        )}
      </div>
    </a>
  )
}
