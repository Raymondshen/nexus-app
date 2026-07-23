'use client'

import { useState, useEffect } from 'react'
import type { Area } from 'react-easy-crop'
import { AnimatePresence, motion } from 'framer-motion'
import { ZoomPanCropper } from '@/shared/components/ui/ZoomPanCropper'
import { loadImageEl, drawCroppedCanvas } from '@/shared/utils/cropImage'
import { createClient } from '@/shared/supabase/client'
import { updateCrewBackgroundImageAction } from '@/app/(app)/chat/actions'
import { compressCanvas, extForBlob, validateImageFile, MAX_OUT_BYTES } from '@/shared/utils/imageCompress'

const ASPECT    = 1080 / 608 // 16:9
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB input limit

// Canvas sizes tried in order — compressCanvas is called for each until ≤200 KB
const CANVAS_SIZES: [number, number][] = [[1080, 608], [800, 450], [540, 304]]

// Tries progressively smaller canvas sizes until compressCanvas finds a blob ≤200 KB.
async function cropToBlob(imgSrc: string, area: Area): Promise<Blob> {
  const img = await loadImageEl(imgSrc)
  let smallest: Blob | null = null
  for (const [w, h] of CANVAS_SIZES) {
    const blob = await compressCanvas(drawCroppedCanvas(img, area, w, h))
    if (!smallest || blob.size < smallest.size) smallest = blob
    if (blob.size <= MAX_OUT_BYTES) return blob
  }
  return smallest!
}

interface CrewBackgroundUploadModalProps {
  file:      File | null
  crewId:    string
  onClose:   () => void
  onSuccess: (url: string) => void
}

export function CrewBackgroundUploadModal({ file, crewId, onClose, onSuccess }: CrewBackgroundUploadModalProps) {
  const isOpen = !!file
  const [imgSrc, setImgSrc]                       = useState('')
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [saving, setSaving]                       = useState(false)
  const [uploadError, setUploadError]             = useState('')

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
      return
    }
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function handleSave() {
    if (!croppedAreaPixels || saving || !file) return
    const validation = validateImageFile(file, MAX_BYTES)
    if (!validation.ok) { setUploadError(validation.error); return }

    setSaving(true)
    setUploadError('')

    try {
      const blob = await cropToBlob(imgSrc, croppedAreaPixels)
      const ext  = extForBlob(blob)
      const ts   = Date.now()
      const path = `${crewId}/bg-${ts}.${ext}`

      const supabase = createClient()
      const { error: storageErr } = await supabase.storage
        .from('crew-images')
        .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
      if (storageErr) throw new Error(`Storage: ${storageErr.message}`)

      const { data: { publicUrl } } = supabase.storage.from('crew-images').getPublicUrl(path)

      const result = await updateCrewBackgroundImageAction(crewId, publicUrl)
      if (result.error) throw new Error(`DB: ${result.error}`)

      onSuccess(publicUrl)
      onClose()
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="crew-bg-backdrop"
            className="fixed inset-0 bg-black/70 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={saving ? undefined : onClose}
          />
          <motion.div
            key="crew-bg-sheet"
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

            {imgSrc && (
              <div className="flex items-center justify-center p-4 flex-1">
                <ZoomPanCropper
                  key={imgSrc}
                  image={imgSrc}
                  aspect={ASPECT}
                  cropShape="rect"
                  height={220}
                  onCropAreaChange={setCroppedAreaPixels}
                />
              </div>
            )}

            {uploadError && (
              <p className="font-pixel text-[7px] text-[#ef4444] px-4 pb-2 leading-relaxed flex-shrink-0 break-all">
                {uploadError}
              </p>
            )}

            <div className="px-4 pt-2 flex-shrink-0">
              <button
                onClick={handleSave}
                disabled={!croppedAreaPixels || saving}
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
