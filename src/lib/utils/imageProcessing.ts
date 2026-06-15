import imageCompression from 'browser-image-compression'
import { IMAGE_CONFIG } from '@/lib/config'

export interface CompressOptions {
  maxWidthOrHeight: number
  quality: number
}

export async function compressImage(file: File, options: CompressOptions): Promise<File> {
  if (file.type === 'image/gif') return file
  const result = await imageCompression(file, {
    maxWidthOrHeight: options.maxWidthOrHeight,
    initialQuality:   options.quality,
    fileType:         'image/webp',
    useWebWorker:     true,
    preserveExif:     false,
  })
  return result
}

export function generateLQIP(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const size   = IMAGE_CONFIG.LQIP_SIZE_PX
      const canvas = document.createElement('canvas')
      canvas.width  = size
      canvas.height = img.height > 0 ? Math.round(size * img.height / img.width) : size
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); resolve(''); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.5))
      URL.revokeObjectURL(url)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })
}

type ValidationResult = { ok: true } | { ok: false; error: string }

export function validateImageUpload(file: File): ValidationResult {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
  if (!allowed.includes(file.type.toLowerCase())) {
    return { ok: false, error: 'Only JPEG, PNG, WebP, GIF, and HEIC images are supported.' }
  }
  const limit = file.type === 'image/gif' ? IMAGE_CONFIG.MAX_GIF_BYTES : IMAGE_CONFIG.MAX_UPLOAD_BYTES
  if (file.size > limit) {
    return { ok: false, error: `Image must be under ${(limit / 1024 / 1024).toFixed(0)}MB.` }
  }
  return { ok: true }
}

export function getNetworkQuality(): 'fast' | 'medium' | 'slow' {
  if (typeof navigator === 'undefined') return 'fast'
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
  const type = conn?.effectiveType
  if (!type || type === '4g') return 'fast'
  if (type === '3g') return 'medium'
  return 'slow'
}
