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
  const router   = useRouter()
  const controls = useAnimation()
  const exiting  = useRef(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

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
  // Without this, navigating after the slide-out animation leaves a blank gap
  // while the server component page is fetched.
  useEffect(() => {
    if (backHref) router.prefetch(backHref)
  }, [backHref, router])

  function handleTouchStart(e: React.TouchEvent) {
    if (!backHref) return
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!backHref || !touchStart.current || exiting.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y)
    // Left-edge origin, significant rightward swipe, mostly horizontal
    if (touchStart.current.x < 35 && dx > 80 && dy < dx) goBack()
    touchStart.current = null
  }

  return (
    <SlideBackContext.Provider value={goBack}>
      <motion.div
        className={className}
        style={style}
        initial={{ x: '100%' }}
        animate={controls}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </motion.div>
    </SlideBackContext.Provider>
  )
}
