'use client'
import { createContext, useContext, useRef, useCallback, useEffect } from 'react'
import { motion, useAnimation } from 'framer-motion'
import { useRouter } from 'next/navigation'

const SlideBackContext = createContext<() => void>(() => {})

export function useSlideBack() {
  return useContext(SlideBackContext)
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

// Set by a custom swipe gesture that already visually revealed the destination page
// before navigating to it (e.g. ChatInput's swipe-between-rooms, whose ChatRoomPeekLayer
// slides a loading-skeleton preview all the way to x:0 as part of the committed swipe) —
// the real SlidePage should then mount silently already-at-rest instead of re-playing its
// own entrance animation on top, which would look like a redundant second slide-in.
export function skipNextSlideEnter() {
  _skipNextSlideEnter = true
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      <motion.div
        ref={containerRef}
        className={className}
        style={style}
        initial={{ x: skipEnter ? 0 : '100%' }}
        animate={controls}
      >
        {children}
      </motion.div>
    </SlideBackContext.Provider>
  )
}
