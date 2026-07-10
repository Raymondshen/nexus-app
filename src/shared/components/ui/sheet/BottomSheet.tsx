'use client'

import { type ReactNode, useRef } from 'react'
import { motion, useDragControls } from 'framer-motion'

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

// How far the finger must travel downward before a pull-to-close drag takes over
// from a (potential) native scroll.
const DRAG_START_THRESHOLD = 6

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
  // dragListener is disabled below so Framer doesn't stamp `touch-action: pan-x` on the
  // sheet (which would kill native vertical scrolling of any inner list). Instead the
  // drag is started manually via these controls only for a downward pull that begins
  // while the inner content is already scrolled to the top — iOS-style pull-to-close.
  const dragControls = useDragControls()
  const sheetRef      = useRef<HTMLDivElement>(null)
  // Per-gesture state captured on pointer-down: start Y + whether a sheet drag is even
  // allowed to begin (i.e. the touch isn't on a list that's scrolled down mid-way).
  const gestureRef    = useRef<{ y: number; canDrag: boolean } | null>(null)

  // Walk from the touched element up to the sheet root looking for a vertically
  // scrollable ancestor. If one exists, a sheet drag may only begin when it's at the
  // top (so pulling down closes, but scrolling within the list scrolls). No scroller →
  // always draggable, matching a short sheet like AddMediaSheet.
  function canDragFrom(target: EventTarget | null): boolean {
    let el = target as HTMLElement | null
    const root = sheetRef.current
    while (el && el !== root) {
      if (el.scrollHeight > el.clientHeight) {
        const overflowY = getComputedStyle(el).overflowY
        if (overflowY === 'auto' || overflowY === 'scroll') return el.scrollTop <= 0
      }
      el = el.parentElement
    }
    return true
  }

  function onPointerDown(e: React.PointerEvent) {
    if (disableDrag) { gestureRef.current = null; return }
    gestureRef.current = { y: e.clientY, canDrag: canDragFrom(e.target) }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gestureRef.current
    if (!g || !g.canDrag) return
    if (e.clientY - g.y > DRAG_START_THRESHOLD) {
      gestureRef.current = null
      dragControls.start(e)
    }
  }

  function endGesture() {
    gestureRef.current = null
  }

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
        drag={disableDrag ? false : 'y'}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
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
