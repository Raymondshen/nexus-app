'use client'
import { createContext, useContext, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'

const SlideBackContext = createContext<() => void>(() => {})

export function useSlideBack() {
  return useContext(SlideBackContext)
}

interface SlidePageProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  backHref?: string
}

export function SlidePage({ children, className, style, backHref }: SlidePageProps) {
  const router = useRouter()
  const [exiting, setExiting] = useState(false)

  const goBack = useCallback(() => {
    if (exiting) return
    setExiting(true)
    setTimeout(() => {
      if (backHref) router.replace(backHref)
      else router.back()
    }, 290)
  }, [router, exiting, backHref])

  return (
    <SlideBackContext.Provider value={goBack}>
      <motion.div
        className={className}
        style={style}
        initial={{ x: '100%' }}
        animate={{ x: exiting ? '100%' : 0 }}
        transition={
          exiting
            ? { type: 'tween', ease: [0.32, 0, 0.67, 0], duration: 0.28 }
            : { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }
        }
      >
        {children}
      </motion.div>
    </SlideBackContext.Provider>
  )
}
