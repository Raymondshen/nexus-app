'use client'

import { useState, useEffect, useRef } from 'react'
import type { OGPreview } from '@/types'

export function useOGPreview(url: string | undefined): { data: OGPreview | null; loading: boolean } {
  const [data,    setData]    = useState<OGPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Genuine data fetching keyed on `url` (React's own "you might not need an effect"
  // guide lists this as one of the two legitimate uses) — the early-return branch is
  // the "nothing to fetch" case of that same effect, not a separate state-mirroring
  // concern that could be computed during render.
  useEffect(() => {
    if (!url) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setData(null)

    fetch(`/api/og-preview?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((json: OGPreview | null) => {
        if (!cancelled && mountedRef.current) {
          setData(json)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) {
          setData(null)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [url])

  return { data, loading }
}
