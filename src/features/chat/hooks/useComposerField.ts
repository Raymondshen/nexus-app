import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Owns the chat composer's hybrid input/textarea sizing system: the field swaps from
// a single-line `<input>` to a multi-line `<textarea>` once typed text would overflow
// the container, and back again once it fits — see recheckOverflow's own comments for
// the exact wrap/fit thresholds. Extracted out of ChatInput (which had grown to
// ~2,500 lines mixing this with presence/mention/send/squad-management concerns);
// nothing about the underlying behavior changed in the move.
export function useComposerField() {
  const [text, setTextState] = useState('')
  const [isMultiline, setIsMultiline] = useState(false)

  const textareaRef       = useRef<HTMLTextAreaElement>(null)
  const inputRef          = useRef<HTMLInputElement>(null)
  const mirrorRef         = useRef<HTMLSpanElement>(null)
  const innerContainerRef = useRef<HTMLDivElement>(null)
  const pendingCaretPosRef = useRef<number | null>(null)
  const isMultilineRef    = useRef(false)
  const textRef           = useRef('')

  // Keep refs in sync on every render so closures and effects always see current
  // values — via layout effect (fires synchronously after render, before paint)
  // rather than a bare assignment in the render body, which react-hooks/refs flags
  // even though nothing reads it back during that same render.
  useLayoutEffect(() => {
    textRef.current = text
    isMultilineRef.current = isMultiline
  })

  // Stable identities (refs-only deps) so effects/callbacks elsewhere that call these
  // can safely list them in a dependency array without re-running on every render.
  const getActiveField = useCallback((): HTMLInputElement | HTMLTextAreaElement | null => {
    return isMultilineRef.current ? textareaRef.current : inputRef.current
  }, [])

  const focusField = useCallback(() => {
    if (isMultilineRef.current) textareaRef.current?.focus()
    else inputRef.current?.focus()
  }, [])

  // Measures text width via the hidden mirror span and swaps element type if needed.
  // Called on every keystroke (via setText below) and on container resize.
  const recheckOverflow = useCallback((val?: string, caretPos?: number) => {
    const currentVal = val ?? textRef.current
    const mirror     = mirrorRef.current
    const container  = innerContainerRef.current
    if (!mirror || !container) return

    mirror.textContent = currentVal || ''
    const mirrorWidth    = mirror.offsetWidth
    const containerWidth = container.clientWidth

    // 2px forward buffer, 6px hysteresis before swapping back — prevents thrashing at boundary
    const willWrap = mirrorWidth > containerWidth - 2
    const willFit  = mirrorWidth < containerWidth - 6

    if (!isMultilineRef.current && willWrap) {
      const pos = caretPos ?? (inputRef.current?.selectionStart ?? currentVal.length)
      pendingCaretPosRef.current = pos
      isMultilineRef.current = true
      setIsMultiline(true)
    } else if (isMultilineRef.current && willFit && !currentVal.includes('\n')) {
      const pos = caretPos ?? (textareaRef.current?.selectionStart ?? currentVal.length)
      pendingCaretPosRef.current = pos
      isMultilineRef.current = false
      setIsMultiline(false)
    } else if (isMultilineRef.current) {
      // Already in textarea mode — update height as content changes
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        const cs  = getComputedStyle(el)
        const lh  = parseFloat(cs.lineHeight) || 24
        const pt  = parseFloat(cs.paddingTop) || 12
        const pb  = parseFloat(cs.paddingBottom) || 12
        el.style.height = Math.min(el.scrollHeight, pt + pb + lh * 3) + 'px'
      }
    }
  }, [])

  // Restore caret and set initial textarea height after element swap
  useLayoutEffect(() => {
    const pos = pendingCaretPosRef.current
    if (pos === null) return
    pendingCaretPosRef.current = null
    const el = isMultiline ? textareaRef.current : inputRef.current
    if (!el) return
    if (isMultiline && el instanceof HTMLTextAreaElement) {
      el.style.height = 'auto'
      const cs  = getComputedStyle(el)
      const lh  = parseFloat(cs.lineHeight) || 24
      const pt  = parseFloat(cs.paddingTop) || 12
      const pb  = parseFloat(cs.paddingBottom) || 12
      el.style.height = Math.min(el.scrollHeight, pt + pb + lh * 3) + 'px'
    }
    el.focus()
    el.setSelectionRange(pos, pos)
  }, [isMultiline])

  // Re-check overflow when the container is resized (orientation change, keyboard open/close)
  useEffect(() => {
    const container = innerContainerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => recheckOverflow())
    ro.observe(container)
    return () => ro.disconnect()
  }, [recheckOverflow])

  // Set + immediately re-measure — the exact combo the input's onChange handler needs
  // (typing can push the field over/under the wrap threshold on every keystroke).
  function setText(val: string, caretPos?: number) {
    setTextState(val)
    textRef.current = val
    recheckOverflow(val, caretPos)
  }

  // Set only, no overflow recheck — used where the caller owns its own follow-up
  // timing instead (the edit-mode population effect defers its recheck to a
  // requestAnimationFrame; mention completion doesn't force one at all, preserving
  // today's actual behavior where completing a mention that pushes the field over
  // the wrap threshold only corrects on the next keystroke or resize).
  function setTextRaw(val: string) {
    setTextState(val)
    textRef.current = val
  }

  // Full reset + collapse to single-line. Returns whether the field WAS multiline —
  // callers that need to branch on that (e.g. whether to focus immediately vs. let
  // the caret-restore effect above do it) must read this return value, since by the
  // time it resolves isMultilineRef has already flipped to false.
  // Stable identity (refs-only deps, same as getActiveField/focusField/recheckOverflow
  // above) — ChatInput's clearComposerText wraps this and is itself listed as a
  // dependency inside useMessageSend's send/sendImages/handleEditSend useCallbacks; an
  // unstable `clear` here would silently defeat all three of those memoizations, since
  // every ChatInput render would hand them a new clearComposerText identity.
  const clear = useCallback((): boolean => {
    setTextState('')
    textRef.current = ''
    const wasMultiline = isMultilineRef.current
    setIsMultiline(false)
    isMultilineRef.current = false
    if (wasMultiline) pendingCaretPosRef.current = 0
    return wasMultiline
  }, [])

  return {
    text, isMultiline,
    textareaRef, inputRef, mirrorRef, innerContainerRef, textRef,
    getActiveField, focusField, recheckOverflow,
    setText, setTextRaw, clear,
  }
}
