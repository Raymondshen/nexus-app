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
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas empty'))),
      'image/webp',
      0.9,
    )
  })
}

interface AvatarUploadModalProps {
  file: File | null
  userId: string
  onClose: () => void
  onSuccess: (url: string) => void
}

export function AvatarUploadModal({ file, userId, onClose, onSuccess }: AvatarUploadModalProps) {
  const isOpen = !!file
  const [imgSrc, setImgSrc]               = useState('')
  const [crop, setCrop]                   = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [saving, setSaving]               = useState(false)
  const [uploadError, setUploadError]     = useState('')
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!file) {
      setImgSrc('')
      setCrop(undefined)
      setCompletedCrop(undefined)
      setUploadError('')
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
    setSaving(true)
    setUploadError('')
    try {
      const blob = await cropToBlob(imgRef.current, completedCrop)
      const path = `${userId}/${Date.now()}.webp`
      const supabase = createClient()

      const { error: storageErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' })
      if (storageErr) throw storageErr

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const result = await updateAvatarAction(publicUrl)
      if (result.error) throw new Error(result.error)

      onSuccess(publicUrl)
      onClose()
    } catch {
      setUploadError('Upload failed. Try again.')
    } finally {
      setSaving(false)
    }
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
              <p className="font-pixel text-[8px] text-[#ef4444] px-4 pb-2 flex-shrink-0">
                {uploadError}
              </p>
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
