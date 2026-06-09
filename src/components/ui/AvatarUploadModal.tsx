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
import { updateAvatarAction } from '@/app/(app)/profile/actions'

const OUTPUT_SIZE = 256

function initCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
    width,
    height,
  )
}

async function cropToBlob(img: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const ctx = canvas.getContext('2d')!
  const scaleX = img.naturalWidth / img.width
  const scaleY = img.naturalHeight / img.height
  ctx.drawImage(
    img,
    crop.x * scaleX, crop.y * scaleY,
    crop.width * scaleX, crop.height * scaleY,
    0, 0,
    OUTPUT_SIZE, OUTPUT_SIZE,
  )
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null — browser may not support WebP'))),
      'image/webp',
      0.9,
    )
  })
}

type StepStatus = 'idle' | 'running' | 'ok' | 'fail'

interface DebugStep {
  label: string
  status: StepStatus
  detail: string
}

interface AvatarUploadModalProps {
  file: File | null
  userId: string
  isDev: boolean
  onClose: () => void
  onSuccess: (url: string) => void
}

export function AvatarUploadModal({ file, userId, isDev, onClose, onSuccess }: AvatarUploadModalProps) {
  const isOpen = !!file
  const [imgSrc, setImgSrc]               = useState('')
  const [crop, setCrop]                   = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [saving, setSaving]               = useState(false)
  const [uploadError, setUploadError]     = useState('')
  const [debugSteps, setDebugSteps]       = useState<DebugStep[]>([])
  const [showDebug, setShowDebug]         = useState(false)
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

  function setStep(steps: DebugStep[], index: number, patch: Partial<DebugStep>): DebugStep[] {
    const next = [...steps]
    next[index] = { ...next[index], ...patch }
    return next
  }

  async function handleSave() {
    if (!imgRef.current || !completedCrop || saving) return
    setSaving(true)
    setUploadError('')

    const steps: DebugStep[] = [
      { label: '1. Canvas crop → WebP blob', status: 'running', detail: '' },
      { label: '2. Supabase storage upload',  status: 'idle',    detail: '' },
      { label: '3. Profile DB update',        status: 'idle',    detail: '' },
    ]
    if (isDev) { setDebugSteps([...steps]); setShowDebug(true) }

    try {
      // ── Step 1: crop to blob ───────────────────────────────────────────────
      let blob: Blob
      try {
        blob = await cropToBlob(imgRef.current, completedCrop)
        steps[0] = { ...steps[0], status: 'ok', detail: `${(blob.size / 1024).toFixed(1)} KB, type=${blob.type}` }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        steps[0] = { ...steps[0], status: 'fail', detail: msg }
        if (isDev) setDebugSteps([...steps])
        throw new Error(`Canvas: ${msg}`)
      }
      if (isDev) setDebugSteps([...steps])

      // ── Step 2: storage upload ─────────────────────────────────────────────
      // Use the blob's actual type — Safari falls back to image/png since it
      // doesn't support WebP canvas output.
      const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const path = `${userId}/${Date.now()}.${ext}`
      steps[1] = { ...steps[1], status: 'running', detail: `path: ${path}, type: ${blob.type}` }
      if (isDev) setDebugSteps([...steps])

      const supabase = createClient()
      const { error: storageErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })

      if (storageErr) {
        steps[1] = { ...steps[1], status: 'fail', detail: `${storageErr.message} (status ${(storageErr as { statusCode?: string }).statusCode ?? '?'})` }
        if (isDev) setDebugSteps([...steps])
        throw new Error(`Storage: ${storageErr.message}`)
      }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      steps[1] = { ...steps[1], status: 'ok', detail: publicUrl }
      if (isDev) setDebugSteps([...steps])

      // ── Step 3: DB update via server action ────────────────────────────────
      steps[2] = { ...steps[2], status: 'running', detail: '' }
      if (isDev) setDebugSteps([...steps])

      const result = await updateAvatarAction(publicUrl)
      if (result.error) {
        steps[2] = { ...steps[2], status: 'fail', detail: result.error }
        if (isDev) setDebugSteps([...steps])
        throw new Error(`DB: ${result.error}`)
      }
      steps[2] = { ...steps[2], status: 'ok', detail: 'custom_avatar=true, caches revalidated' }
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
            key="avatar-backdrop"
            className="fixed inset-0 bg-black/70 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={saving ? undefined : onClose}
          />
          <motion.div
            key="avatar-sheet"
            className="fixed bottom-0 left-0 right-0 z-[80] bg-[#0a0612] border-t border-border flex flex-col"
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
              <span className="font-pixel text-[10px] text-primary leading-none">CHANGE PHOTO</span>
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
                style={{ minHeight: 260, maxHeight: 360, overflow: 'hidden' }}
              >
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1}
                  style={{ maxWidth: '100%', maxHeight: 320 }}
                >
                  {/* plain <img> required — next/image interferes with crop overlay positioning */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imgRef}
                    src={imgSrc}
                    alt="Crop preview"
                    onLoad={onImageLoad}
                    style={{ maxWidth: '100%', maxHeight: 320, display: 'block' }}
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
                  {saving ? '...' : 'SAVE PHOTO'}
                </span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
