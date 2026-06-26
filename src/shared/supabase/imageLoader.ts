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
