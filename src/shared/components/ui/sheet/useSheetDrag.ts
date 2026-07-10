'use client'

import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useDragControls, type PanInfo } from 'framer-motion'

// Distance (px) a finger must travel downward before a pull-to-close drag takes over
// from a possible native scroll.
const DRAG_START_THRESHOLD = 6
// Release thresholds past which the sheet dismisses instead of snapping back.
const CLOSE_OFFSET = 80
const CLOSE_VELOCITY = 400

/**
 * Shared bottom-sheet pull-to-close gesture, used by both the standard `BottomSheet` and
 * the `SquadDetailsSheet` panel so the drag feels identical.
 *
 * Framer's `drag` with the default listener stamps `touch-action: pan-x` on the sheet,
 * which kills native vertical scrolling of any inner list on touch devices. So this runs
 * with `dragListener={false}` and starts the drag manually via `dragControls` — only for a
 * downward pull that begins while the nearest inner scroller is already at its top
 * (iOS-style pull-to-close). Otherwise the touch scrolls the inner list natively.
 *
 * Returns a ref for the sheet root plus a bag of props to spread onto the sheet's
 * `motion.div`. Pass `disabled` (e.g. a non-dismissible sheet or an in-flight async op) to
 * lock the gesture entirely.
 */
export function useSheetDrag(onClose: () => void, disabled = false) {
  const dragControls = useDragControls()
  const sheetRef     = useRef<HTMLDivElement>(null)
  // Per-gesture state captured on pointer-down: start Y + whether a sheet drag is even
  // allowed to begin (i.e. the touch isn't on a list that's scrolled part-way down).
  const gestureRef   = useRef<{ y: number; canDrag: boolean } | null>(null)

  // Walk from the touched element up to the sheet root looking for a vertically
  // scrollable ancestor. If one exists, a drag may only begin when it's at the top (so
  // pulling down closes, but scrolling within the list scrolls). No scroller → always
  // draggable, matching a short sheet like AddMediaSheet.
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

  const dragProps = {
    drag: (disabled ? false : 'y') as false | 'y',
    dragListener: false,
    dragControls,
    dragConstraints: { top: 0, bottom: 0 },
    dragElastic: { top: 0, bottom: 1 },
    onPointerDown(e: ReactPointerEvent) {
      if (disabled) { gestureRef.current = null; return }
      gestureRef.current = { y: e.clientY, canDrag: canDragFrom(e.target) }
    },
    onPointerMove(e: ReactPointerEvent) {
      const g = gestureRef.current
      if (!g || !g.canDrag) return
      if (e.clientY - g.y > DRAG_START_THRESHOLD) {
        gestureRef.current = null
        dragControls.start(e)
      }
    },
    onPointerUp()     { gestureRef.current = null },
    onPointerCancel() { gestureRef.current = null },
    onDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
      if (!disabled && (info.offset.y > CLOSE_OFFSET || info.velocity.y > CLOSE_VELOCITY)) onClose()
    },
  }

  return { sheetRef, dragProps }
}
