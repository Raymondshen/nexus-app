/**
 * Center-crop `file` to the exact `w×h` pixel ratio then encode as WebP at 0.85 quality.
 * Used for crew profile photos (256×256) and background images (1080×608).
 */
export async function resizeImageToBlob(file: File, w: number, h: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img     = new window.Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      const canvas   = document.createElement('canvas')
      canvas.width   = w
      canvas.height  = h
      const ratio    = w / h
      const srcRatio = img.width / img.height
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (srcRatio > ratio) {
        sw = Math.round(img.height * ratio)
        sx = Math.round((img.width - sw) / 2)
      } else {
        sh = Math.round(img.width / ratio)
        sy = Math.round((img.height - sh) / 2)
      }
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', 0.85)
    }
    img.onerror = reject
    img.src     = blobUrl
  })
}

// Shared canvas → compressed Blob utility used by all image upload modals.
// Enforces a 200 KB hard limit by stepping down quality, then falling back to
// JPEG (for Safari which can't produce WebP from canvas), and returning the
// smallest result found if the limit can't be met.

export const MAX_OUT_BYTES = 200 * 1024 // 200 KB

const WEBP_QUALITIES = [0.85, 0.70, 0.55, 0.40, 0.25, 0.10]
const JPEG_QUALITIES = [0.90, 0.75, 0.60, 0.45, 0.30]

function blobAsync(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Compress a pre-drawn canvas to at most `maxBytes`.
 *
 * Strategy:
 *  1. Try WebP at decreasing quality steps — stop at the first result ≤ maxBytes.
 *  2. If WebP returns null (Safari), try JPEG at decreasing quality steps instead.
 *  3. If nothing fits, return the smallest blob found (best-effort).
 *  4. If all toBlob calls return null, fall back to lossless PNG.
 */
export async function compressCanvas(
  canvas: HTMLCanvasElement,
  maxBytes = MAX_OUT_BYTES,
): Promise<Blob> {
  let smallest: Blob | null = null

  // WebP pass
  let webpSupported = true
  for (const q of WEBP_QUALITIES) {
    const blob = await blobAsync(canvas, 'image/webp', q)
    if (!blob) { webpSupported = false; break }
    if (!smallest || blob.size < smallest.size) smallest = blob
    if (blob.size <= maxBytes) return blob
  }

  // JPEG pass (always run on Safari; also run on other browsers if WebP alone doesn't fit)
  if (!webpSupported || (smallest && smallest.size > maxBytes)) {
    for (const q of JPEG_QUALITIES) {
      const blob = await blobAsync(canvas, 'image/jpeg', q)
      if (!blob) break
      if (!smallest || blob.size < smallest.size) smallest = blob
      if (blob.size <= maxBytes) return blob
    }
  }

  if (smallest) return smallest

  // PNG last resort (lossless — likely over limit for large canvases)
  const png = await blobAsync(canvas, 'image/png')
  if (png) return png
  throw new Error('canvas.toBlob failed for all formats')
}
