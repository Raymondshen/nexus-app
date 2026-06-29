import type { ImageLoaderProps } from 'next/image'

// Converts a Supabase Storage object URL to a render/transform URL so
// Next.js can request a correctly-sized version at serve time.
// Falls through for non-Supabase URLs (e.g. blob: or external hosts).
export function supabaseImageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!src.includes('/storage/v1/object/public/')) return src
  const transformed = src.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  const url = new URL(transformed)
  url.searchParams.set('width', String(width))
  url.searchParams.set('quality', String(quality ?? 75))
  return url.toString()
}

// Avatar-specific loader: forces a square crop so the circular avatar frame
// is always filled correctly regardless of source aspect ratio.
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
