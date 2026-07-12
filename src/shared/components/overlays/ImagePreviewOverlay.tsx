'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { IMAGE_PREVIEW_Z_INDEX } from '@/shared/constants/config'

const FALLBACK_BLUR = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

interface ImagePreviewOverlayProps {
  src:          string
  blurDataURL?: string
  alt?:         string
  /** Source is guaranteed 1:1 (e.g. a pre-cropped profile photo) — frame it in a centered square instead of full-bleed contain. */
  square?:      boolean
  onClose:      () => void
}

export function ImagePreviewOverlay({ src, blurDataURL, alt, square, onClose }: ImagePreviewOverlayProps) {
  const touchStartY = useRef(0)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <motion.div
      key="img-preview-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: IMAGE_PREVIEW_Z_INDEX,
        background: 'rgba(0,0,0,0.95)',
      }}
      onClick={onClose}
      onTouchStart={(e) => { touchStartY.current = e.touches[0]?.clientY ?? 0 }}
      onTouchEnd={(e) => {
        if ((e.changedTouches[0]?.clientY ?? 0) - touchStartY.current > 80) onClose()
      }}
    >
      {/* Close button — 44px touch target */}
      <button
        onClick={onClose}
        onTouchStart={(e) => e.stopPropagation()}
        aria-label="Close preview"
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          right: 16,
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.8)',
          zIndex: 1,
        }}
        className="active:text-white font-pixel text-[12px]"
      >
        ✕
      </button>

      {/* Image container — stopPropagation prevents background close on tap */}
      <motion.div
        initial={{ scale: 0.92 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.92 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={
          square
            ? {
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 'min(100vw, 100vh)',
                height: 'min(100vw, 100vh)',
                transform: 'translate(-50%, -50%)',
                touchAction: 'pinch-zoom',
              }
            : { position: 'absolute', inset: 0, touchAction: 'pinch-zoom' }
        }
      >
        <Image
          src={src}
          alt={alt ?? 'Shared image'}
          fill
          sizes={square ? '100vh' : '100vw'}
          style={{ objectFit: 'contain' }}
          placeholder="blur"
          blurDataURL={blurDataURL ?? FALLBACK_BLUR}
          decoding="async"
          priority
          unoptimized
        />
      </motion.div>
    </motion.div>
  )
}
