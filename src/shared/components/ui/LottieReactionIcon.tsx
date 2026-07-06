'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Lottie, { type LottieRef } from 'lottie-react'

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}
function getReducedMotionSnapshot() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
function getReducedMotionServerSnapshot() {
  return false
}

// Shared across every instance on screen — many reaction pills can show the same
// emoji (e.g. several messages all reacted with 🤗), so the same 20-70KB JSON gets
// fetched + JSON.parsed once and reused, rather than once per mounted icon. This is
// the biggest lever against jank/battery drain alongside the visibility gating below.
const animationDataCache = new Map<string, Promise<object>>()

function loadAnimationData(src: string): Promise<object> {
  let cached = animationDataCache.get(src)
  if (!cached) {
    cached = fetch(src).then((r) => r.json())
    animationDataCache.set(src, cached)
  }
  return cached
}

// A continuously-looping Lottie player never stops ticking requestAnimationFrame —
// expensive to keep running, especially with several instances visible at once (a
// message with multiple reactions, or several reacted messages on screen). Playing
// once and resting between plays looks like a gentle pulse instead of nonstop motion
// and costs a fraction of the CPU/battery. ~2s animation + ~1.5s rest.
const LOOP_REST_MS = 1500

interface LottieReactionIconProps {
  /** Path to the Lottie JSON, e.g. from REACTION_LOTTIE_MAP (src/shared/constants/config.ts). */
  src:        string
  size?:      number
  className?: string
}

export function LottieReactionIcon({ src, size = 24, className }: LottieReactionIconProps) {
  const [animationData, setAnimationData] = useState<object | null>(null)
  const [inView,        setInView]        = useState(false)
  const [pageVisible,   setPageVisible]   = useState(true)
  // Respect the OS-level reduced-motion setting — renders a static frame instead.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion, getReducedMotionSnapshot, getReducedMotionServerSnapshot,
  )

  const containerRef  = useRef<HTMLDivElement>(null)
  const lottieRef: LottieRef = useRef(null)
  const restTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldPlayRef  = useRef(false)

  // Fetch (or reuse the cached fetch of) this icon's animation data. `src` is
  // effectively static per mounted instance (callers key their .map() by emoji,
  // so a different emoji remounts rather than changes src in place).
  useEffect(() => {
    let cancelled = false
    loadAnimationData(src).then((data) => { if (!cancelled) setAnimationData(data) }).catch(() => {})
    return () => { cancelled = true }
  }, [src])

  // Only animate while actually scrolled into view — virtualization overscan keeps
  // some off-screen message bubbles mounted, which would otherwise animate unseen.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Pause while the app is backgrounded (PWA multitasking, screen locked, tab hidden).
  useEffect(() => {
    function onVisibility() { setPageVisible(document.visibilityState === 'visible') }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const shouldPlay = inView && pageVisible && !reducedMotion
  // Kept in sync via effect (not during render) so the delayed replay timer below
  // always reads the latest value without becoming a render-time ref mutation.
  useEffect(() => { shouldPlayRef.current = shouldPlay }, [shouldPlay])

  useEffect(() => {
    if (!animationData) return
    if (reducedMotion) {
      if (restTimerRef.current) { clearTimeout(restTimerRef.current); restTimerRef.current = null }
      lottieRef.current?.goToAndStop(0, true)
      return
    }
    if (shouldPlay) lottieRef.current?.play()
    else lottieRef.current?.pause()
  }, [shouldPlay, reducedMotion, animationData])

  // Clear any pending replay timer on unmount.
  useEffect(() => () => { if (restTimerRef.current) clearTimeout(restTimerRef.current) }, [])

  function handleComplete() {
    if (restTimerRef.current) clearTimeout(restTimerRef.current)
    restTimerRef.current = setTimeout(() => {
      if (shouldPlayRef.current) lottieRef.current?.goToAndPlay(0, true)
    }, LOOP_REST_MS)
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: size, height: size, pointerEvents: 'none', flexShrink: 0 }}
    >
      {animationData && (
        <Lottie
          lottieRef={lottieRef}
          animationData={animationData}
          loop={false}
          autoplay={false}
          onComplete={handleComplete}
          renderer="svg"
          rendererSettings={{ preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true }}
          style={{ width: size, height: size }}
        />
      )}
    </div>
  )
}
