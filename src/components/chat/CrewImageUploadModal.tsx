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
import { updateCrewImageAction } from '@/app/(app)/chat/actions'
import { compressCanvas } from '@/lib/imageCompress'

const SIZES = [128, 256] as const
type VariantSize = typeof SIZES[number]

const ACCEPTED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heic-sequence', 'image/heif',
])
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB input limit

function initCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
    width,
    height,
  )
}

async function cropToBlobs(
  img: HTMLImageElement,
  crop: PixelCrop,
): Promise<{ size: VariantSize; blob: Blob }[]> {
  const scaleX = img.naturalWidth / img.width
  const scaleY = img.naturalHeight / img.height
  return Promise.all(
    SIZES.map(async (size) => {
      const canvas = document.createElement('canvas')
      canvas.width  = size
      canvas.height = size
      canvas.getContext('2d')!.drawImage(
        img,
        crop.x * scaleX, crop.y * scaleY,
        crop.width * scaleX, crop.height * scaleY,
        0, 0, size, size,
      )
      const blob = await compressCanvas(canvas)
      return { size, blob }
    }),
  )
}

interface CrewImageUploadModalProps {
  file:      File | null
  crewId:    string
  onClose:   () => void
  onSuccess: (url: string) => void
}

export function CrewImageUploadModal({ file, crewId, onClose, onSuccess }: CrewImageUploadModalProps) {
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
    if (!imgRef.current || !completedCrop || saving || !file) return
    if (!ACCEPTED_TYPES.has(file.type.toLowerCase())) {
      setUploadError('Unsupported format. Use JPG, PNG, WebP, or HEIC.')
      return
    }
    if (file.size > MAX_BYTES) {
      setUploadError('File too large. Maximum 10 MB.')
      return
    }

    setSaving(true)
    setUploadError('')

    try {
      const variants = await cropToBlobs(imgRef.current, completedCrop)
      const ext = variants[0].blob.type === 'image/webp' ? 'webp'
        : variants[0].blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const ts = Date.now()

      const supabase = createClient()
      const uploadResults = await Promise.all(
        variants.map(({ size, blob }) =>
          supabase.storage.from('crew-images').upload(
            `${crewId}/${ts}-${size}.${ext}`,
            blob,
            { contentType: blob.type, cacheControl: '31536000' },
          ),
        ),
      )

      const failed = uploadResults.find(({ error }) => error)
      if (failed?.error) throw new Error(`Storage: ${failed.error.message}`)

      const { data: { publicUrl } } = supabase.storage
        .from('crew-images')
        .getPublicUrl(`${crewId}/${ts}-256.${ext}`)

      const result = await updateCrewImageAction(crewId, publicUrl, `${crewId}/${ts}`)
      if (result.error) throw new Error(result.error)

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
            key="crew-img-backdrop"
            className="fixed inset-0 bg-black/70 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={saving ? undefined : onClose}
          />
          <motion.div
            key="crew-img-sheet"
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
              <span className="font-pixel text-[10px] text-primary leading-none">CREW PHOTO</span>
              <button
                onClick={onClose}
                disabled={saving}
                className="font-silkscreen text-[12px] text-muted disabled:opacity-40"
              >
                Cancel
              </button>
            </div>

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
                  {/* plain <img> required — next/image interferes with crop overlay */}
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

            {uploadError && (
              <p className="font-pixel text-[7px] text-[#ef4444] px-4 pb-2 leading-relaxed flex-shrink-0 break-all">
                {uploadError}
              </p>
            )}

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
