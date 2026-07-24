'use client'

// ─── VinylComboArt — peeking vinyl disc + album art combo (Figma 684:15757) ───
// Extracted from CurrentVibeRow so the exact same 88×56 combo (real vinyl-mockup.png
// texture behind a square og_image tile, with a small circular og_image "label" clipped
// onto the disc per Figma's Exclude cutout) can also back VibesPlaylistSheet's pinned
// card (Figma 690:16468) without duplicating this geometry a third time.

interface VinylComboArtProps {
  imgSrc: string | null
  href:   string
}

export function VinylComboArt({ imgSrc, href }: VinylComboArtProps) {
  return (
    <div className="relative flex-shrink-0" style={{ width: 88, height: 56 }}>
      {/* Vinyl disc — real vinyl-mockup.png texture, 64.167×64.167 offset -4.08/-4.08
          within the 56×56 clip box (exact Figma geometry). Spins with the same
          animate-vinyl keyframe (globals.css) as LinkPill's vinyl pill and
          VibesGrid's pinned VinylTrack — applied to an inset-0 wrapper so the disc
          rotates around its own true center while the outer box only clips it to a circle. */}
      <div
        aria-hidden
        className="absolute overflow-hidden rounded-full"
        style={{ left: 32, top: 0, width: 56, height: 56 }}
      >
        <div className="absolute inset-0 animate-vinyl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/vinyl-mockup.png"
            alt=""
            style={{ position: 'absolute', left: -4.08, top: -4.08, width: 64.167, height: 64.167, maxWidth: 'none' }}
          />
          {/* Label — the Figma "Exclude" cutout (18.02,18.02 / 19.952×19.952 within the 56×56 disc)
              is this exact circle: not a plain color, but the note's own og_image clipped small,
              standing in for the vinyl's label. */}
          <div
            className="absolute overflow-hidden rounded-full"
            style={{ left: 18.02, top: 18.02, width: 19.952, height: 19.952 }}
          >
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: '#e8e4d8' }} />
            )}
            {/* Spindle hole */}
            <div className="absolute rounded-full" style={{ inset: '46%', background: '#050505' }} />
          </div>
        </div>
      </div>

      {/* Album art — square, in front, note.og_image_url */}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute overflow-hidden flex-shrink-0"
        style={{ left: 0, top: 0, width: 56, height: 56 }}
      >
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--color-surface)' }} />
        )}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(45deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 27.408%, rgba(0,0,0,0.1) 53.37%, rgba(0,0,0,0) 100%)' }}
        />
      </a>
    </div>
  )
}
