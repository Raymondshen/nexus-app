'use client'

import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useSheetDrag } from './useSheetDrag'

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
  /** CSS background override (e.g. the nexus gradient). Defaults to --color-surface-sheet. */
  background?:          string
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
  background = 'var(--color-surface-sheet)',
  dismissOnPointerDown = false,
}: BottomSheetProps) {
  // Pull-to-close that coexists with inner scrolling — see useSheetDrag.
  const { sheetRef, dragProps } = useSheetDrag(onClose, disableDrag)

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
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 rounded-tl-[16px] rounded-tr-[16px] flex flex-col${className ? ` ${className}` : ''}`}
        style={{ zIndex, maxHeight, paddingTop: 'var(--space-7)', background }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        {...dragProps}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </>
  )
}
