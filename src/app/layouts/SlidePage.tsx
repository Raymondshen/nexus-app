'use client'
import { createContext, useContext, useRef, useCallback, useEffect } from 'react'
import { motion, useAnimation } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { SWIPE_NAV_ARRIVAL_FADE_MS, SWIPE_NAV_ARRIVAL_FADE_EASE, useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'

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

// Companion flag to _skipNextSlideEnter — see skipNextSlideEnter's `fadeIn` param below.
let _fadeInOnNextSkip = false

// Set by a custom swipe gesture that already visually revealed the destination page
// before navigating to it (e.g. ChatInput's swipe-between-rooms, whose ChatRoomPeekLayer
// slides a loading-ghost preview all the way to x:0 as part of the committed swipe) —
// the real SlidePage should then mount silently already-at-rest instead of re-playing its
// own entrance animation on top, which would look like a redundant second slide-in.
//
// `fadeIn`: opt-in opacity crossfade for the case where "already at rest" would
// otherwise be a hard visual pop — the destination's real content wasn't on screen at
// all before this navigation (unlike a plain back-nav, where the previous page was
// already rendered underneath and popping straight to visible is correct). Chat's
// swipe-nav is the only current caller that passes this: SlidePage mounts at opacity 0
// and stays there — it does NOT start fading in the instant it mounts. It waits on
// chatRoomPeekStore's `revealReady` flag instead (see the effect below), which only
// flips once ChatRoomPeekLayer's own reveal timeline has run its course (a guaranteed
// minimum reveal window, then a landed-check, then a hold — see that component's doc
// comment for the full choreography); once it does, this page fades to opacity 1 over
// SWIPE_NAV_ARRIVAL_FADE_MS, blending from whatever's still showing underneath
// (ChatRoomPeekLayer keeps itself mounted for that same duration) instead of instantly
// occluding it.
export function skipNextSlideEnter(fadeIn = false) {
  _skipNextSlideEnter  = true
  _fadeInOnNextSkip    = fadeIn
}

// Set by chat's ChatFloatingNav (src/shared/components/ui/PageFloatButton.tsx) right before
// it calls goBack(), so HomeClient knows to play a slide-in + dim "reveal" animation on mount
// instead of a static mount — matching the parallax WebKit's native
// edge-swipe gesture already gives for free. Only the tap path needs this: chat's
// SlidePage used nativeSwipe (now disableSwipe — left-edge swipe is blocked
// entirely, see chat/[crewId]/page.tsx), so its own swipe-to-close handler (which
// also calls goBack()) never ran here either way.
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
  // When true: no swipe-to-close at all, custom or native — a left-edge touch is
  // consumed (preventDefault) but never triggers navigation or a drag animation.
  // Takes priority over nativeSwipe. Used by pages with no other way back (e.g.
  // group chat, which has no back button) where a stray edge swipe should be a
  // no-op rather than exiting the page.
  disableSwipe?: boolean
}

export function SlidePage({ children, className, style, backHref, nativeSwipe, disableSwipe }: SlidePageProps) {
  const router       = useRouter()
  const controls     = useAnimation()
  const exiting      = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // Read synchronously at render time so initial= is correct on first paint.
  const skipEnter    = _skipNextSlideEnter
  const fadeInOnSkip = _fadeInOnNextSkip
  // Snapshotted into a ref (rather than read fresh from the module var on every render)
  // because the mount effect below clears `_fadeInOnNextSkip` back to false right after
  // reading it — a later re-render of this SAME instance (e.g. when `revealReady` flips,
  // which can happen up to ~1.5s after mount) would otherwise recompute `fadeInOnSkip` as
  // false and silently defeat the gated effect further down. `useRef`'s initializer only
  // ever runs once, so this preserves the value as of first render regardless of what the
  // module var does afterward.
  const fadeInOnSkipRef = useRef(fadeInOnSkip)

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
  }, [controls, router, backHref])

  useEffect(() => {
    if (skipEnter) {
      _skipNextSlideEnter = false
      _fadeInOnNextSkip   = false
      // fadeInOnSkip's own opacity tween is NOT started here — see the `revealReady`-
      // gated effect below for why, and this page stays at its initial opacity:0 (set
      // via the `initial=` prop further down) until that fires.
    } else {
      controls.start({
        x: 0,
        transition: { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 },
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Chat's swipe-nav arrival crossfade: don't start fading this page in the instant it
  // mounts — wait for ChatRoomPeekLayer's own reveal timeline to actually finish first
  // (see skipNextSlideEnter's `fadeIn` doc comment above). Only relevant when
  // fadeInOnSkip was true at mount; `revealReady` is otherwise irrelevant to every other
  // SlidePage in the app (plain nav, back-nav) and stays false for them.
  const revealReady = useChatRoomPeekStore((s) => s.revealReady)
  useEffect(() => {
    if (!fadeInOnSkipRef.current || !revealReady) return
    controls.start({
      opacity: 1,
      transition: { duration: SWIPE_NAV_ARRIVAL_FADE_MS / 1000, ease: SWIPE_NAV_ARRIVAL_FADE_EASE },
    })
  }, [revealReady, controls])

  useEffect(() => {
    if (backHref) router.prefetch(backHref)
  }, [backHref, router])

  // Left-edge swipe is fully disabled: consume the touch (preventDefault, so the
  // native OS/browser edge-swipe-back never fires either) but never navigate or
  // animate. No custom handler below runs in this mode.
  useEffect(() => {
    if (!disableSwipe) return
    const el = containerRef.current
    if (!el) return

    let startX  = 0
    let startY  = 0
    let blocking = false

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      if (startX < 40) {
        blocking = true
        e.preventDefault()
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!blocking) return
      const dx = e.touches[0].clientX - startX
      const dy = Math.abs(e.touches[0].clientY - startY)
      if (dy > dx || dx < 0) { blocking = false; return }
      e.preventDefault()
    }

    function onTouchEnd() {
      blocking = false
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [disableSwipe])

  // Custom swipe-to-close: page follows finger from the left edge.
  // Skipped when nativeSwipe=true (native gesture handles it instead, rendering the
  // real previous page in the background during the drag) or when disableSwipe=true
  // (handled by the effect above instead).
  useEffect(() => {
    if (nativeSwipe || disableSwipe) return
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
  }, [backHref, nativeSwipe, disableSwipe, controls, router])

  return (
    <SlideBackContext.Provider value={goBack}>
      <motion.div
        ref={containerRef}
        className={className}
        style={style}
        initial={{ x: skipEnter ? 0 : '100%', opacity: skipEnter && fadeInOnSkip ? 0 : 1 }}
        animate={controls}
      >
        {children}
      </motion.div>
    </SlideBackContext.Provider>
  )
}
