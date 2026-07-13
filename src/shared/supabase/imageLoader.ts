import type { ImageLoaderProps } from 'next/image'

// Converts a Supabase Storage object URL to a render/transform URL so
// Next.js can request a correctly-sized version at serve time.
// Falls through for non-Supabase URLs (e.g. blob: or external hosts).
//
// `resize=contain` is required — Supabase's render endpoint's default resize
// mode, when only `width` is given (no `height`/`resize`), does NOT scale
// proportionally: it resizes the width to the requested value but leaves the
// height at the source's original pixel value. For a 1080x608 (16:9)
// background photo, `?width=360` alone returned 360x608 — a portrait-squished
// image at a completely different aspect ratio — not 360x203 as expected.
// Every CSS `object-fit` was working against that malformed source, which is
// what actually caused UserCard/ProfileHeroBackground's background images to
// look zoomed in, not a container aspect-ratio mismatch. Verified directly
// against the render endpoint before fixing — do not remove this param.
export function supabaseImageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!src.includes('/storage/v1/object/public/')) return src
  const transformed = src.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  const url = new URL(transformed)
  url.searchParams.set('width', String(width))
  url.searchParams.set('resize', 'contain')
  url.searchParams.set('quality', String(quality ?? 75))
  return url.toString()
}

// Forces a square (1:1) render regardless of source aspect ratio — used
// anywhere the display frame is guaranteed square (avatars, group images,
// pre-cropped profile gallery photos).
// - Supabase storage: passes both width+height so the render API center-crops to 1:1
// - Google profile photos: normalises the size param and adds the -c crop flag
// - Other URLs: falls through unchanged
export function avatarImageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (src.includes('/storage/v1/object/public/')) {
    const transformed = src.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
    const url = new URL(transformed)
    url.searchParams.set('width', String(width))
    url.searchParams.set('height', String(width))
    url.searchParams.set('quality', String(quality ?? 75))
    return url.toString()
  }
  if (src.includes('googleusercontent.com')) {
    return src.replace(/=s\d+(-[a-z0-9]+)*$/i, `=s${width}-c`)
  }
  return src
}
