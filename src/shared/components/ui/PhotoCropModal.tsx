'use client'

import { useState, useEffect } from 'react'
import type { Area } from 'react-easy-crop'
import { AnimatePresence, motion } from 'framer-motion'
import { ZoomPanCropper } from '@/shared/components/ui/ZoomPanCropper'
import { loadImageEl } from '@/shared/utils/cropImage'

interface PhotoCropModalProps {
  file:          File | null
  aspect:        number
  cropShape?:    'round' | 'rect'
  title:         string
  confirmLabel?: string
  height?:       number
  onCancel:      () => void
  // img is already fully loaded/decoded — safe to draw synchronously even after
  // the caller closes this modal (which revokes the underlying blob URL).
  onConfirm:     (area: Area, img: HTMLImageElement) => void
}

// Generic fixed-frame pan/zoom crop sheet for surfaces with no bespoke upload
// chrome of their own — the caller still owns all upload/compression/DB logic,
// this only produces the cropped area + a ready-to-draw image.
export function PhotoCropModal({
  file, aspect, cropShape = 'rect', title, confirmLabel = 'USE PHOTO', height = 300, onCancel, onConfirm,
}: PhotoCropModalProps) {
  const isOpen = !!file
  const [imgSrc, setImgSrc]                       = useState('')
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [confirming, setConfirming]               = useState(false)

  useEffect(() => {
    if (!file) {
      setImgSrc('')
      setCroppedAreaPixels(null)
      setConfirming(false)
      return
    }
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function handleConfirm() {
    if (!croppedAreaPixels || confirming) return
    setConfirming(true)
    try {
      const img = await loadImageEl(imgSrc)
      onConfirm(croppedAreaPixels, img)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="photo-crop-backdrop"
            className="fixed inset-0 bg-black/70 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
          />
          <motion.div
            key="photo-crop-sheet"
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
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onCancel() }}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
              <span className="font-pixel text-[10px] text-primary leading-none">{title}</span>
              <button onClick={onCancel} className="font-silkscreen text-[12px] text-muted">
                Cancel
              </button>
            </div>

            {imgSrc && (
              <div className="flex items-center justify-center p-4 flex-1">
                <ZoomPanCropper
                  key={imgSrc}
                  image={imgSrc}
                  aspect={aspect}
                  cropShape={cropShape}
                  height={height}
                  onCropAreaChange={setCroppedAreaPixels}
                />
              </div>
            )}

            <div className="px-4 pt-2 flex-shrink-0">
              <button
                onClick={handleConfirm}
                disabled={!croppedAreaPixels || confirming}
                className="w-full h-12 bg-purple flex items-center justify-center transition-opacity disabled:opacity-40"
              >
                <span className="font-pixel text-[10px] text-white leading-none">
                  {confirming ? '...' : confirmLabel}
                </span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
