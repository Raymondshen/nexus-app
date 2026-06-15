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

  useEffect(() => {
    if (!url) {
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
