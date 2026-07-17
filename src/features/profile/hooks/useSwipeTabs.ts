'use client'

import { useEffect, useRef, type RefObject } from 'react'

const SWIPE_DISTANCE_THRESHOLD = 60
const SWIPE_VELOCITY_THRESHOLD = 400
const SWIPE_INTENT_THRESHOLD   = 10

// ─── useSwipeTabs ───────────────────────────────────────────────────────────
// Horizontal swipe-to-switch for the profile screens' Photos/Vibes tab content
// (ProfileClient, AccountPageMember) — swipe left advances to the next tab in
// `order`, swipe right goes to the previous one. Mirrors SlidePage's own touch
// gesture math (dominant-axis lock, distance-OR-velocity threshold) so the feel
// is consistent with the rest of the app. Only a confirmed horizontal drag gets
// preventDefault'd — vertical scrolling inside the tab content (the grids' own
// overflow-y-auto) passes through untouched.
export function useSwipeTabs<T extends string>(
  containerRef: RefObject<HTMLDivElement | null>,
  order:        Record<T, number>,
  activeTab:    T,
  onSwitch:     (tab: T) => void,
) {
  // Refs so the listeners (attached once, below) always read the latest values
  // without needing to be torn down/reattached on every render. Synced in an
  // effect (not during render) — writing to a ref's `current` is a side effect.
  const orderRef  = useRef(order)
  const activeRef = useRef(activeTab)
  const switchRef = useRef(onSwitch)
  useEffect(() => {
    orderRef.current  = order
    activeRef.current = activeTab
    switchRef.current = onSwitch
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let lastX  = 0
    let lastT  = 0
    let horizontal: boolean | null = null // null = axis not yet decided

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      lastX  = startX
      lastT  = Date.now()
      horizontal = null
    }

    function onTouchMove(e: TouchEvent) {
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY

      if (horizontal === null) {
        if (Math.abs(dx) < SWIPE_INTENT_THRESHOLD && Math.abs(dy) < SWIPE_INTENT_THRESHOLD) return
        horizontal = Math.abs(dx) > Math.abs(dy)
      }
      if (!horizontal) return

      e.preventDefault()
      lastX = e.touches[0].clientX
      lastT = Date.now()
    }

    function onTouchEnd(e: TouchEvent) {
      if (!horizontal) return
      const endX = e.changedTouches[0].clientX
      const dx   = endX - startX
      const dt   = Date.now() - lastT
      const vel  = dt > 0 ? (endX - lastX) / dt * 1000 : 0

      if (Math.abs(dx) < SWIPE_DISTANCE_THRESHOLD && Math.abs(vel) < SWIPE_VELOCITY_THRESHOLD) return

      const currentOrder = orderRef.current
      const currentIndex = currentOrder[activeRef.current]
      const targetIndex  = dx < 0 ? currentIndex + 1 : currentIndex - 1
      const nextTab = (Object.keys(currentOrder) as T[]).find(tab => currentOrder[tab] === targetIndex)
      if (nextTab) switchRef.current(nextTab)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [containerRef])
}
