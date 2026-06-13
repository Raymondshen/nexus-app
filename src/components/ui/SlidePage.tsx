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
let _skipNextSlideEnter = false

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

  const goBack = useCallback(() => {
    if (exiting.current) return
    exiting.current    = true
    _skipNextSlideEnter = true
    controls.start({
      x: '100%',
      transition: { type: 'tween', ease: [0.32, 0, 0.67, 0], duration: 0.28 },
    }).then(() => {
      if (backHref) router.replace(backHref)
      else          router.back()
    })
  }, [controls, router, backHref]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SlideBackContext.Provider value={goBack}>
      <motion.div
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
