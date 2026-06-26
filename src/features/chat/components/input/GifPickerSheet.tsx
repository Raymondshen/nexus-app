'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'pixelarticons/react/Search'
import { KLIPY_SEARCH_DEBOUNCE_MS, KLIPY_PAGE_SIZE } from '@/shared/constants/config'

interface KlipyGif {
  id:           string
  title:        string
  thumbnailUrl: string
  gifUrl:       string
  width:        number
  height:       number
  blurPreview:  string | null
}

interface GifResponse {
  gifs:    KlipyGif[]
  hasNext: boolean
  page:    number
}

interface GifPickerSheetProps {
  onSelect: (gifUrl: string) => void
  onClose:  () => void
}

function GifThumbnail({ gif, onSelect }: { gif: KlipyGif; onSelect: () => void }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <button
      onClick={onSelect}
      aria-label={gif.title || 'GIF'}
      className="relative overflow-hidden w-full active:opacity-70 transition-opacity focus:outline-none bg-surface"
      style={{ aspectRatio: '4/3', display: 'block' }}
    >
      {gif.blurPreview && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={gif.blurPreview}
          alt=""
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={gif.thumbnailUrl}
        alt={gif.title || 'GIF'}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.15s ease',
        }}
      />
    </button>
  )
}

export function GifPickerSheet({ onSelect, onClose }: GifPickerSheetProps) {
  const [query,   setQuery]   = useState('')
  const [gifs,    setGifs]    = useState<KlipyGif[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [page,    setPage]    = useState(1)
  const [hasNext, setHasNext] = useState(false)

  const sentinelRef  = useRef<HTMLDivElement>(null)
  const prevQueryRef = useRef('')
  const loadingRef   = useRef(true)
  loadingRef.current = loading

  const fetchGifs = useCallback(async (q: string, pageNum: number, append: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const url = q.trim()
        ? `/api/gif?type=search&q=${encodeURIComponent(q.trim())}&page=${pageNum}`
        : `/api/gif?type=trending&page=${pageNum}`
      const res  = await fetch(url)
      const data = await res.json() as GifResponse & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load GIFs')
      setGifs((prev) => append ? [...prev, ...data.gifs] : data.gifs)
      setHasNext(data.hasNext)
      setPage(pageNum)
    } catch {
      setError('Failed to load GIFs. Tap to retry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGifs('', 1, false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (query === prevQueryRef.current) return
    prevQueryRef.current = query
    const delay = query.trim() ? KLIPY_SEARCH_DEBOUNCE_MS : 0
    const timer = setTimeout(() => fetchGifs(query, 1, false), delay)
    return () => clearTimeout(timer)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNext) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingRef.current) {
          fetchGifs(query, page + 1, true)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNext, page, query, fetchGifs])

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border flex flex-col"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input + attribution */}
        <div className="flex-shrink-0 flex flex-col px-4 pt-6" style={{ gap: 4 }}>
          <div className="flex items-center border border-border h-12 px-4" style={{ gap: 8 }}>
            <Search style={{ width: 16, height: 16, color: 'var(--color-muted)', flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIFs..."
              className="flex-1 bg-transparent font-body text-[14px] text-primary placeholder:text-muted focus:outline-none leading-normal min-w-0"
              style={{ fontVariationSettings: '"opsz" 14' }}
            />
          </div>
          <span
            className="font-silkscreen text-tertiary leading-none"
            style={{ fontSize: 8, letterSpacing: '0.2px' }}
          >
            Powered by Klipy
          </span>
        </div>

        {/* GIF grid */}
        <div className="flex-1 overflow-y-auto nexus-scroll px-4" style={{ minHeight: 0, paddingTop: 24, paddingBottom: 28 }}>
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <p className="font-silkscreen text-[8px] text-tertiary leading-relaxed text-center">{error}</p>
              <button
                onClick={() => fetchGifs(query, 1, false)}
                className="font-silkscreen text-[8px] text-purple active:opacity-70"
              >
                RETRY
              </button>
            </div>
          ) : gifs.length === 0 && !loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="font-silkscreen text-[8px] text-tertiary">No GIFs found</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, paddingBottom: 4 }}>
              {gifs.map((gif) => (
                <GifThumbnail
                  key={gif.id}
                  gif={gif}
                  onSelect={() => { onSelect(gif.gifUrl); onClose() }}
                />
              ))}
              {loading && gifs.length === 0 && Array.from({ length: KLIPY_PAGE_SIZE }).map((_, i) => (
                <div key={`sk-${i}`} className="bg-border animate-pulse" style={{ aspectRatio: '4/3' }} />
              ))}
              {loading && gifs.length > 0 && (
                <div className="col-span-2 flex items-center justify-center py-4">
                  <span className="font-silkscreen text-[8px] text-tertiary">···</span>
                </div>
              )}
              <div ref={sentinelRef} className="col-span-2 h-1" />
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
