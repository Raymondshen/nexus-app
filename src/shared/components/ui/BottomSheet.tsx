'use client'

import { type ReactNode } from 'react'
import { motion } from 'framer-motion'

interface BottomSheetProps {
  onClose:              () => void
  children:             ReactNode
  /** Sheet z-index; backdrop renders at zIndex - 10. Default 70. */
  zIndex?:              number
  /** CSS max-height on the sheet container, e.g. '70vh'. Unset = natural height. */
  maxHeight?:           string
  /** Set true while an async operation is in progress to lock drag-to-dismiss. */
  disableDrag?:         boolean
  /** Additional Tailwind classes on the sheet container. */
  className?:           string
  /**
   * Use pointer-down events (onTouchStart + onMouseDown) on the backdrop instead
   * of onClick. Required when the sheet opens via long-press so the synthetic
   * click fired on touchend does not immediately dismiss it.
   */
  dismissOnPointerDown?: boolean
}

export function BottomSheet({
  onClose,
  children,
  zIndex = 70,
  maxHeight,
  disableDrag = false,
  className,
  dismissOnPointerDown = false,
}: BottomSheetProps) {
  const backdropProps = dismissOnPointerDown
    ? {
        onTouchStart: (e: React.TouchEvent) => { e.stopPropagation(); onClose() },
        onMouseDown:  (e: React.MouseEvent) => { e.stopPropagation(); onClose() },
      }
    : { onClick: onClose }

  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black/60"
        style={{ zIndex: zIndex - 10 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        {...backdropProps}
      />
      <motion.div
        className={`fixed bottom-0 left-0 right-0 bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col${className ? ` ${className}` : ''}`}
        style={{ zIndex, maxHeight, paddingTop: 'var(--space-7)' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag={disableDrag ? false : 'y'}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => {
          if (!disableDrag && (info.offset.y > 80 || info.velocity.y > 400)) onClose()
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </>
  )
}
