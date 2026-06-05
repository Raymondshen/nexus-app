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
}

export function SlidePage({ children, className, style }: SlidePageProps) {
  const router = useRouter()
  const [exiting, setExiting] = useState(false)

  const goBack = useCallback(() => {
    if (exiting) return
    setExiting(true)
    setTimeout(() => router.back(), 290)
  }, [router, exiting])

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
