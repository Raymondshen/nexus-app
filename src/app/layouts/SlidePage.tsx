'use client'
import { createContext, useContext, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, useAnimation } from 'framer-motion'
import { useRouter } from 'next/navigation'

const SlideBackContext = createContext<() => void>(() => {})

export function useSlideBack() {
  return useContext(SlideBackContext)
}

// ─── SlidePage gesture handle ──────────────────────────────────────────────
// Lets a descendant drive SlidePage's own slide transform for a custom horizontal
// swipe gesture living elsewhere on the page (e.g. ChatInput's swipe-between-rooms),
// reusing the exact same `controls`/`exiting` SlidePage already uses for its edge-
// swipe-to-close gesture, for a consistent feel. Only safe to combine with a page's
// own gesture when that page passes `nativeSwipe` (chat rooms do) — that leaves
// SlidePage's own JS touch handlers dormant, so there's no fight over `controls`.
export interface SlidePageGestureHandle {
  /** Call once, right before the first setDragX of a gesture — stops any in-flight animation (entrance/exit) so the drag isn't fighting it. */
  startDrag:   () => void
  /** Live 1:1 finger-follow — call on every pan move with the desired x offset. */
  setDragX:    (x: number) => void
  /** Gesture released below its commit threshold — springs back to x:0. */
  cancelDrag:  () => void
  /**
   * Gesture released past its commit threshold — tweens the page fully off-screen in
   * `direction` (same tween goBack() uses) and marks the page as exiting so no other
   * exit gesture can also fire. Returns false (no-op) if already exiting. Caller fires
   * the actual navigation immediately after — same "simultaneous nav + exit animation"
   * technique goBack() uses.
   */
  commitSwipe: (direction: 'left' | 'right') => boolean
}

const noopGestureHandle: SlidePageGestureHandle = {
  startDrag:   () => {},
  setDragX:    () => {},
  cancelDrag:  () => {},
  commitSwipe: () => false,
}

const SlidePageGestureContext = createContext<SlidePageGestureHandle>(noopGestureHandle)

export function useSlidePageGesture() {
  return useContext(SlidePageGestureContext)
}

// Set by the exiting page before it calls router.back/replace.
// Consumed by the next SlidePage that mounts — skips the slide-in animation
// so the destination page doesn't re-animate from the right on back-navigation.
// Only set when the back-destination is another SlidePage (router.back()).
// Never set when backHref is provided (destination is /home, which has no SlidePage).
let _skipNextSlideEnter = false

// Called by HomeClient on every home mount to clear any stale flag that
// wasn't consumed (e.g. friends/vault/DM used router.back() to reach home).
export function clearSkipNextSlideEnter() {
  _skipNextSlideEnter = false
}

// Which edge the next SlidePage to mount should enter from — 'right' (the default
// enter-from-right animation) unless a custom swipe gesture just exited the current
// page toward the right (e.g. ChatInput's swipe-to-*previous*-room, which continues
// the exiting page off to the right and wants the destination to keep entering from
// the left, not pop in from the opposite edge). Read synchronously at render time
// (same pattern as _skipNextSlideEnter) and reset on every mount regardless of which
// branch consumed it, so it can never leak into an unrelated later navigation.
let _nextSlideEnterFrom: 'left' | 'right' = 'right'

export function setNextSlideEnterFrom(direction: 'left' | 'right') {
  _nextSlideEnterFrom = direction
}

// Set by chat's ChatFloatingNav (src/shared/components/ui/PageFloatButton.tsx) right before
// it calls goBack(), so HomeClient knows to play a slide-in + dim "reveal" animation on mount
// instead of a static mount — matching the parallax WebKit's native
// edge-swipe gesture already gives for free. Only the tap path needs this:
// chat's SlidePage uses nativeSwipe, so its own swipe-to-close handler
// (which also calls goBack()) never runs, and the native gesture doesn't
// need any app-level animation to reveal the previous page.
let _homeParallaxPending = false

export function markHomeParallaxReveal() {
  _homeParallaxPending = true
}

// Read-and-clear, so a flag left over from one back-nav can't leak into a
// later, unrelated mount of Home.
export function consumeHomeParallaxReveal(): boolean {
  const pending = _homeParallaxPending
  _homeParallaxPending = false
  return pending
}

interface SlidePageProps {
  children:    React.ReactNode
  className?:  string
  style?:      React.CSSProperties
  backHref?:   string
  // When true: goBack() still uses router.replace(backHref) for the back button,
  // but custom touch handlers are NOT registered — native iOS swipe handles the
  // gesture and shows the real previous page in the background.
  nativeSwipe?: boolean
}

export function SlidePage({ children, className, style, backHref, nativeSwipe }: SlidePageProps) {
  const router       = useRouter()
  const controls     = useAnimation()
  const exiting      = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // Read synchronously at render time so initial= is correct on first paint.
  const skipEnter    = _skipNextSlideEnter
  const enterFrom    = _nextSlideEnterFrom

  const goBack = useCallback(() => {
    if (exiting.current) return
    exiting.current = true
    if (!backHref) _skipNextSlideEnter = true
    // Fire navigation and animation simultaneously — the chat page is position:fixed
    // so it overlays the previous page while sliding away, giving the destination
    // 150ms of free loading time. Matches what the swipe-to-close gesture already does.
    if (backHref) router.replace(backHref)
    else router.back()
    controls.start({
      x: '100%',
      transition: { type: 'tween', ease: [0.32, 0, 0.67, 0], duration: 0.15 },
    })
  }, [controls, router, backHref]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (skipEnter) {
      _skipNextSlideEnter = false
    } else {
      controls.start({
        x: 0,
        transition: { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 },
      })
    }
    // Reset regardless of which branch ran above, so a stale direction can never leak
    // into a later, unrelated mount.
    _nextSlideEnterFrom = 'right'
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gesture handle — lets a descendant (e.g. ChatInput's swipe-between-rooms) drive
  // this same `controls`/`exiting` for its own custom horizontal swipe. See
  // SlidePageGestureHandle's doc comment for why this is only safe alongside a page's
  // own edge-swipe when nativeSwipe is set.
  const startDrag = useCallback(() => {
    controls.stop()
  }, [controls])

  const setDragX = useCallback((x: number) => {
    controls.set({ x })
  }, [controls])

  const cancelDrag = useCallback(() => {
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 500, damping: 40 } })
  }, [controls])

  const commitSwipe = useCallback((direction: 'left' | 'right') => {
    if (exiting.current) return false
    exiting.current = true
    controls.start({
      x: direction === 'left' ? -window.innerWidth : window.innerWidth,
      transition: { type: 'tween', ease: [0.32, 0, 0.67, 0], duration: 0.15 },
    })
    return true
  }, [controls])

  const gestureHandle = useMemo<SlidePageGestureHandle>(
    () => ({ startDrag, setDragX, cancelDrag, commitSwipe }),
    [startDrag, setDragX, cancelDrag, commitSwipe]
  )

  useEffect(() => {
    if (backHref) router.prefetch(backHref)
  }, [backHref, router])

  // Custom swipe-to-close: page follows finger from the left edge.
  // Skipped when nativeSwipe=true so the iOS native gesture handles it instead,
  // which renders the real previous page (home) in the background during the drag.
  useEffect(() => {
    if (nativeSwipe) return
    const el = containerRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let lastX  = 0
    let lastT  = 0
    let active = false

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      lastX  = startX
      lastT  = Date.now()
      if (startX < 40) {
        active = true
        e.preventDefault()
        controls.stop()
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!active) return
      const dx = e.touches[0].clientX - startX
      const dy = Math.abs(e.touches[0].clientY - startY)
      if (dy > dx || dx < 0) {
        active = false
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 500, damping: 40 } })
        return
      }
      e.preventDefault()
      lastX = e.touches[0].clientX
      lastT = Date.now()
      controls.set({ x: dx })
    }

    function onTouchEnd(e: TouchEvent) {
      if (!active || exiting.current) return
      active = false
      const endX = e.changedTouches[0].clientX
      const dx   = endX - startX
      const dt   = Date.now() - lastT
      const vel  = dt > 0 ? (endX - lastX) / dt * 1000 : 0

      if (dx > 80 || vel > 400) {
        exiting.current = true
        if (backHref) {
          router.replace(backHref)
        } else {
          _skipNextSlideEnter = true
          router.back()
        }
        controls.start({
          x: window.innerWidth,
          transition: { type: 'tween', ease: [0.32, 0, 0.67, 0], duration: 0.12 },
        })
      } else {
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 500, damping: 40 } })
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [backHref, nativeSwipe, controls, router])

  return (
    <SlideBackContext.Provider value={goBack}>
      <SlidePageGestureContext.Provider value={gestureHandle}>
        <motion.div
          ref={containerRef}
          className={className}
          style={style}
          initial={{ x: skipEnter ? 0 : (enterFrom === 'left' ? '-100%' : '100%') }}
          animate={controls}
        >
          {children}
        </motion.div>
      </SlidePageGestureContext.Provider>
    </SlideBackContext.Provider>
  )
}
