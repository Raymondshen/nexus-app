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

interface SlidePageProps {
  children:  React.ReactNode
  className?: string
  style?:    React.CSSProperties
  backHref?: string
}

export function SlidePage({ children, className, style, backHref }: SlidePageProps) {
  const router       = useRouter()
  const controls     = useAnimation()
  const exiting      = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const goBack = useCallback(() => {
    if (exiting.current) return
    exiting.current = true
    // Only skip the next enter animation when going back via router.back() — the
    // previous page in history is another SlidePage that should not re-animate.
    // When backHref is set (destination is /home, which has no SlidePage), skip
    // setting the flag so it doesn't linger and incorrectly suppress the next
    // forward navigation's slide-in.
    if (!backHref) _skipNextSlideEnter = true
    controls.start({
      x: '100%',
      transition: { type: 'tween', ease: [0.32, 0, 0.67, 0], duration: 0.28 },
    }).then(() => {
      if (backHref) router.replace(backHref)
      else          router.back()
    })
  }, [controls, router, backHref]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (_skipNextSlideEnter) {
      _skipNextSlideEnter = false
      controls.set({ x: 0 })           // instant — no slide-in on back-nav
    } else {
      controls.start({                   // normal forward-nav slide-in
        x: 0,
        transition: { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 },
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fetch the back destination so it renders instantly when goBack fires.
  useEffect(() => {
    if (backHref) router.prefetch(backHref)
  }, [backHref, router])

  // Left-edge swipe-back: non-passive touchstart so preventDefault() blocks the
  // native iOS edge-swipe gesture, preventing both from firing simultaneously.
  useEffect(() => {
    if (!backHref) return
    const el = containerRef.current
    if (!el) return

    let startX = 0
    let startY = 0

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      // Block iOS native edge-swipe when the touch originates near the left edge
      if (startX < 35) e.preventDefault()
    }

    function onTouchEnd(e: TouchEvent) {
      if (exiting.current) return
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - startY)
      if (startX < 35 && dx > 80 && dy < dx) {
        exiting.current = true
        router.replace(backHref)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [backHref, router])

  return (
    <SlideBackContext.Provider value={goBack}>
      <motion.div
        ref={containerRef}
        className={className}
        style={style}
        initial={{ x: '100%' }}
        animate={controls}
      >
        {children}
      </motion.div>
    </SlideBackContext.Provider>
  )
}
