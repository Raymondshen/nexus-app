'use client'
import { useState, useEffect } from 'react'

export default function DelayedSkeleton({ children, delay = 300 }: { children: React.ReactNode; delay?: number }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  if (!show) return null
  return <>{children}</>
}
