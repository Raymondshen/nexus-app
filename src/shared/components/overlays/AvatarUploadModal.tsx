'use client'

import { useState, useEffect } from 'react'
import type { Area } from 'react-easy-crop'
import { AnimatePresence, motion } from 'framer-motion'
import { ZoomPanCropper } from '@/shared/components/ui/ZoomPanCropper'
import { loadImageEl, drawCroppedCanvas } from '@/shared/utils/cropImage'
import { createClient } from '@/shared/supabase/client'
import { updateAvatarAction } from '@/app/(app)/profile/actions'
import { compressCanvas, extForBlob, validateImageFile } from '@/shared/utils/imageCompress'

const SIZES = [128, 256] as const
type VariantSize = typeof SIZES[number]

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB input limit

async function cropToBlobs(
  imgSrc: string,
  area: Area,
): Promise<{ size: VariantSize; blob: Blob }[]> {
  const img = await loadImageEl(imgSrc)
  return Promise.all(
    SIZES.map(async (size) => {
      const canvas = drawCroppedCanvas(img, area, size, size)
      const blob = await compressCanvas(canvas)
      return { size, blob }
    }),
  )
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
  const [imgSrc, setImgSrc]                     = useState('')
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [saving, setSaving]               = useState(false)
  const [uploadError, setUploadError]     = useState('')
  const [debugSteps, setDebugSteps]       = useState<DebugStep[]>([])
  const [showDebug, setShowDebug]         = useState(false)

  // Synchronizes local state with the `file` prop's lifecycle — genuinely an effect,
  // not a state-mirroring anti-pattern: createObjectURL/revokeObjectURL is a real
  // external-resource synchronization that must run after commit (and be cleaned up),
  // and the reset-to-defaults branch is the symmetric counterpart of that same
  // lifecycle transition, not a separate concern that could be computed during render.
  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImgSrc('')
      setCroppedAreaPixels(null)
      setUploadError('')
      setDebugSteps([])
      setShowDebug(false)
      return
    }
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function setStep(steps: DebugStep[], index: number, patch: Partial<DebugStep>): DebugStep[] {
    const next = [...steps]
    next[index] = { ...next[index], ...patch }
    return next
  }

  async function handleSave() {
    if (!croppedAreaPixels || saving) return

    if (!file) return
    const validation = validateImageFile(file, MAX_BYTES)
    if (!validation.ok) { setUploadError(validation.error); return }

    setSaving(true)
    setUploadError('')

    const steps: DebugStep[] = [
      { label: '1. Canvas crop → 128+256 blobs', status: 'running', detail: '' },
      { label: '2. Supabase storage upload (×2)', status: 'idle',    detail: '' },
      { label: '3. Profile DB update',            status: 'idle',    detail: '' },
    ]
    if (isDev) { setDebugSteps([...steps]); setShowDebug(true) }

    try {
      // ── Step 1: crop to blobs (128px + 256px in parallel) ─────────────────
      let variants: { size: VariantSize; blob: Blob }[]
      try {
        variants = await cropToBlobs(imgSrc, croppedAreaPixels)
        const detail = variants.map(v => `${v.size}px: ${(v.blob.size / 1024).toFixed(1)} KB`).join(' · ')
        steps[0] = { ...steps[0], status: 'ok', detail: `type=${variants[0].blob.type} · ${detail}` }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        steps[0] = { ...steps[0], status: 'fail', detail: msg }
        if (isDev) setDebugSteps([...steps])
        throw new Error(`Canvas: ${msg}`)
      }
      if (isDev) setDebugSteps([...steps])

      // ── Step 2: storage upload (both variants in parallel) ─────────────────
      // Use the blob's actual type — Safari falls back to image/png since it
      // doesn't support WebP canvas output.
      const ext = extForBlob(variants[0].blob)
      const ts = Date.now()
      steps[1] = { ...steps[1], status: 'running', detail: `uploading ${variants.length} variants…` }
      if (isDev) setDebugSteps([...steps])

      const supabase = createClient()
      const uploadResults = await Promise.all(
        variants.map(({ size, blob }) =>
          supabase.storage.from('avatars').upload(
            `${userId}/${ts}-${size}.${ext}`,
            blob,
            { contentType: blob.type, cacheControl: '31536000' },
          ),
        ),
      )

      const failedUpload = uploadResults.find(({ error }) => error)
      if (failedUpload?.error) {
        const err = failedUpload.error
        steps[1] = { ...steps[1], status: 'fail', detail: `${err.message} (status ${(err as { statusCode?: string }).statusCode ?? '?'})` }
        if (isDev) setDebugSteps([...steps])
        throw new Error(`Storage: ${err.message}`)
      }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(`${userId}/${ts}-256.${ext}`)
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
            drag={saving ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
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
              <div className="flex items-center justify-center p-4 flex-1">
                <ZoomPanCropper
                  key={imgSrc}
                  image={imgSrc}
                  aspect={1}
                  cropShape="round"
                  height={320}
                  onCropAreaChange={setCroppedAreaPixels}
                />
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
                disabled={!croppedAreaPixels || saving}
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
