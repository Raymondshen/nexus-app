// Shared canvas → compressed Blob utility used by all image upload modals.
// Enforces a 200 KB hard limit by stepping down quality, then falling back to
// JPEG (for Safari which can't produce WebP from canvas), and returning the
// smallest result found if the limit can't be met.

export const MAX_OUT_BYTES = 200 * 1024 // 200 KB

// Single source of truth for every crop-based upload surface (avatar, profile/crew
// background, crew image, photo gallery, crew-creation pickers, event cover) — do
// not re-declare this set locally in a caller.
export const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heic-sequence', 'image/heif',
])

type ImageValidation = { ok: true } | { ok: false; error: string }

export function validateImageFile(file: File, maxBytes: number): ImageValidation {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return { ok: false, error: 'Unsupported format. Use JPG, PNG, WebP, or HEIC.' }
  }
  if (file.size > maxBytes) {
    return { ok: false, error: `File too large. Maximum ${Math.round(maxBytes / 1024 / 1024)} MB.` }
  }
  return { ok: true }
}

// compressCanvas falls back to JPEG (Safari) or PNG (toBlob failure) when WebP
// encoding isn't available — always derive the extension/contentType from the
// blob it actually returned, never assume WebP.
export function extForBlob(blob: Blob): 'webp' | 'jpg' | 'png' {
  return blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png'
}

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
