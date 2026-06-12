'use client'

import { useState, useRef, useEffect } from 'react'
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { AnimatePresence, motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { updateBackgroundAction } from '@/app/(app)/profile/actions'

const ASPECT       = 1080 / 608 // 16:9
const MAX_OUT_BYTES = 200 * 1024  // 200 KB hard limit

const ACCEPTED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heic-sequence', 'image/heif',
])
const MAX_BYTES = 15 * 1024 * 1024

// Canvas sizes tried in order — fall to smaller if the budget isn't met
const CANVAS_SIZES: [number, number][] = [[1080, 608], [800, 450], [540, 304]]
// Quality steps tried for each size before moving to next size
const WEBP_QUALITIES  = [0.85, 0.70, 0.55, 0.40, 0.25, 0.10]
const JPEG_QUALITIES  = [0.90, 0.75, 0.60, 0.45, 0.30]

function initCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, ASPECT, width, height),
    width,
    height,
  )
}

function blobAsync(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

function drawCanvas(img: HTMLImageElement, crop: PixelCrop, w: number, h: number): HTMLCanvasElement {
  const scaleX = img.naturalWidth  / img.width
  const scaleY = img.naturalHeight / img.height
  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(
    img,
    crop.x * scaleX, crop.y * scaleY,
    crop.width * scaleX, crop.height * scaleY,
    0, 0, w, h,
  )
  return canvas
}

// Returns the smallest-quality blob ≤ 200 KB, trying progressively smaller
// sizes/qualities. Falls back to the smallest result if nothing fits.
async function cropToBlob(img: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  let smallest: Blob | null = null

  for (const [w, h] of CANVAS_SIZES) {
    const canvas = drawCanvas(img, crop, w, h)

    // WebP first (Safari silently returns null — treated as "not supported")
    let webpSupported = true
    for (const q of WEBP_QUALITIES) {
      const blob = await blobAsync(canvas, 'image/webp', q)
      if (!blob) { webpSupported = false; break }       // Safari: skip WebP entirely
      if (!smallest || blob.size < smallest.size) smallest = blob
      if (blob.size <= MAX_OUT_BYTES) return blob
    }

    // JPEG fallback (or primary on Safari)
    if (!webpSupported) {
      for (const q of JPEG_QUALITIES) {
        const blob = await blobAsync(canvas, 'image/jpeg', q)
        if (!blob) break
        if (!smallest || blob.size < smallest.size) smallest = blob
        if (blob.size <= MAX_OUT_BYTES) return blob
      }
    }
  }

  // PNG last resort (lossless — likely over limit, but best effort)
  if (!smallest) {
    const canvas = drawCanvas(img, crop, 540, 304)
    const blob = await blobAsync(canvas, 'image/png')
    if (blob) return blob
    throw new Error('canvas.toBlob failed')
  }

  // Return the closest-to-limit result we found
  return smallest
}

type StepStatus = 'idle' | 'running' | 'ok' | 'fail'

interface DebugStep {
  label:  string
  status: StepStatus
  detail: string
}

interface BackgroundUploadModalProps {
  file:      File | null
  userId:    string
  isDev:     boolean
  onClose:   () => void
  onSuccess: (url: string) => void
}

export function BackgroundUploadModal({ file, userId, isDev, onClose, onSuccess }: BackgroundUploadModalProps) {
  const isOpen = !!file
  const [imgSrc,         setImgSrc]         = useState('')
  const [crop,           setCrop]           = useState<Crop>()
  const [completedCrop,  setCompletedCrop]  = useState<PixelCrop>()
  const [saving,         setSaving]         = useState(false)
  const [uploadError,    setUploadError]    = useState('')
  const [debugSteps,     setDebugSteps]     = useState<DebugStep[]>([])
  const [showDebug,      setShowDebug]      = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!file) {
      setImgSrc('')
      setCrop(undefined)
      setCompletedCrop(undefined)
      setUploadError('')
      setDebugSteps([])
      setShowDebug(false)
      return
    }
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget
    setCrop(initCrop(naturalWidth, naturalHeight))
  }

  async function handleSave() {
    if (!imgRef.current || !completedCrop || saving) return
    if (!file) return
    if (!ACCEPTED_TYPES.has(file.type.toLowerCase())) {
      setUploadError('Unsupported format. Use JPG, PNG, WebP, or HEIC.')
      return
    }
    if (file.size > MAX_BYTES) {
      setUploadError('File too large. Maximum 15 MB.')
      return
    }

    setSaving(true)
    setUploadError('')

    const steps: DebugStep[] = [
      { label: '1. Canvas crop + compress ≤200 KB',             status: 'running', detail: '' },
      { label: '2. Supabase storage upload',                     status: 'idle',    detail: '' },
      { label: '3. Profile DB update',                           status: 'idle',    detail: '' },
    ]
    if (isDev) { setDebugSteps([...steps]); setShowDebug(true) }

    try {
      // ── Step 1: crop to blob ──────────────────────────────────────────────────
      let blob: Blob
      try {
        blob = await cropToBlob(imgRef.current, completedCrop)
        const kb = (blob.size / 1024).toFixed(1)
        const over = blob.size > MAX_OUT_BYTES ? ` ⚠ over ${Math.round(MAX_OUT_BYTES / 1024)} KB limit` : ''
        steps[0] = { ...steps[0], status: 'ok', detail: `type=${blob.type} · ${kb} KB${over}` }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        steps[0] = { ...steps[0], status: 'fail', detail: msg }
        if (isDev) setDebugSteps([...steps])
        throw new Error(`Canvas: ${msg}`)
      }
      if (isDev) setDebugSteps([...steps])

      // ── Step 2: storage upload ────────────────────────────────────────────────
      const ext  = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const ts   = Date.now()
      const path = `${userId}/${ts}.${ext}`
      steps[1] = { ...steps[1], status: 'running', detail: `uploading backgrounds/${path}…` }
      if (isDev) setDebugSteps([...steps])

      const supabase = createClient()
      const { error: storageErr } = await supabase.storage
        .from('backgrounds')
        .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })

      if (storageErr) {
        steps[1] = { ...steps[1], status: 'fail', detail: storageErr.message }
        if (isDev) setDebugSteps([...steps])
        throw new Error(`Storage: ${storageErr.message}`)
      }
      const { data: { publicUrl } } = supabase.storage.from('backgrounds').getPublicUrl(path)
      steps[1] = { ...steps[1], status: 'ok', detail: publicUrl }
      if (isDev) setDebugSteps([...steps])

      // ── Step 3: DB update ─────────────────────────────────────────────────────
      steps[2] = { ...steps[2], status: 'running', detail: '' }
      if (isDev) setDebugSteps([...steps])

      const result = await updateBackgroundAction(publicUrl)
      if (result.error) {
        steps[2] = { ...steps[2], status: 'fail', detail: result.error }
        if (isDev) setDebugSteps([...steps])
        throw new Error(`DB: ${result.error}`)
      }
      steps[2] = { ...steps[2], status: 'ok', detail: 'background_url saved, caches revalidated' }
      if (isDev) setDebugSteps([...steps])

      onSuccess(publicUrl)
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setUploadError(isDev ? msg : 'Upload failed. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const stepColor: Record<StepStatus, string> = {
    idle:    'rgba(255,255,255,0.3)',
    running: '#f59e0b',
    ok:      '#66bb6a',
    fail:    '#ef4444',
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="bg-backdrop"
            className="fixed inset-0 bg-black/70 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={saving ? undefined : onClose}
          />
          <motion.div
            key="bg-sheet"
            className="fixed bottom-0 left-0 right-0 z-[80] bg-surface border-t border-border-hover flex flex-col"
            style={{
              maxWidth: 480,
              marginLeft: 'auto',
              marginRight: 'auto',
              paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
              <span className="font-pixel text-[10px] text-primary leading-none">CHANGE COVER</span>
              <button
                onClick={onClose}
                disabled={saving}
                className="font-silkscreen text-[12px] text-muted disabled:opacity-40"
              >
                Cancel
              </button>
            </div>

            {/* Crop area */}
            {imgSrc && (
              <div
                className="flex items-center justify-center p-4 flex-1"
                style={{ minHeight: 180, maxHeight: 300, overflow: 'hidden' }}
              >
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={ASPECT}
                  style={{ maxWidth: '100%', maxHeight: 260 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imgRef}
                    src={imgSrc}
                    alt="Crop preview"
                    onLoad={onImageLoad}
                    style={{ maxWidth: '100%', maxHeight: 260, display: 'block' }}
                  />
                </ReactCrop>
              </div>
            )}

            {/* Error */}
            {uploadError && (
              <p className="font-pixel text-[7px] text-[#ef4444] px-4 pb-2 leading-relaxed flex-shrink-0 break-all">
                {uploadError}
              </p>
            )}

            {/* Dev debug panel */}
            {isDev && showDebug && debugSteps.length > 0 && (
              <div className="mx-4 mb-3 flex-shrink-0 border border-[rgba(255,215,0,0.25)] bg-[rgba(255,215,0,0.04)] p-3 flex flex-col gap-2">
                <p className="font-pixel text-[7px] text-[#ffd700] leading-none">DEBUG</p>
                {debugSteps.map((step, i) => (
                  <div key={i} className="flex flex-col gap-[2px]">
                    <p className="font-silkscreen text-[9px] leading-none" style={{ color: stepColor[step.status] }}>
                      {step.status === 'running' ? '⟳' : step.status === 'ok' ? '✓' : step.status === 'fail' ? '✗' : '○'}{' '}
                      {step.label}
                    </p>
                    {step.detail && (
                      <p className="font-silkscreen text-[8px] leading-relaxed break-all pl-3" style={{ color: stepColor[step.status], opacity: 0.8 }}>
                        {step.detail}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Save button */}
            <div className="px-4 pt-2 flex-shrink-0">
              <button
                onClick={handleSave}
                disabled={!completedCrop || saving}
                className="w-full h-12 bg-purple flex items-center justify-center transition-opacity disabled:opacity-40"
              >
                <span className="font-pixel text-[10px] text-white leading-none">
                  {saving ? '...' : 'SAVE COVER'}
                </span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
