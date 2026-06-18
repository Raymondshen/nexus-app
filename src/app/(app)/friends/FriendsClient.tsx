'use client'

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { motion } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Search } from 'pixelarticons/react/Search'
import { Inbox } from 'pixelarticons/react/Inbox'
import { Message as MessageIcon } from 'pixelarticons/react/Message'
import { MailRight } from 'pixelarticons/react/MailRight'
import { createClient } from '@/lib/supabase/client'
import { signInWithGoogle } from '@/lib/supabase/auth'
import { sendFriendRequestAction } from './actions'
import type { Friendship, FriendProfile } from '@/types'

function BackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: 24, height: 40 }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
    </button>
  )
}

export interface FriendEntry {
  friendship: Friendship
  profile:    FriendProfile | null
}

interface FriendsClientProps {
  userId:       string
  isGuest:      boolean
  friends:      FriendEntry[]
  pendingCount: number
}

function friendshipYear(iso: string): string {
  try { return new Date(iso).getFullYear().toString() } catch { return '' }
}

// ─── Status ticker — same implementation as home AccountPreview ──────────────

function StatusTicker({ status }: { status: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRef      = useRef<HTMLSpanElement>(null)
  const [numCopies, setNumCopies] = useState(6)
  const [animPx,    setAnimPx]    = useState(0)

  useLayoutEffect(() => {
    const container = containerRef.current
    const item      = itemRef.current
    if (!container || !item) return
    const cw = container.clientWidth
    const iw = item.offsetWidth
    if (iw <= 0) return
    const halfNeeded = Math.ceil(cw / iw) + 1
    const n          = Math.max(4, halfNeeded % 2 === 0 ? halfNeeded * 2 : (halfNeeded + 1) * 2)
    setNumCopies(n)
    setAnimPx(iw * (n / 2))
  }, [status])

  const duration = Math.max(21, status.length * 0.28 + 15)

  return (
    <div
      ref={containerRef}
      className="overflow-hidden border-t border-b border-border"
      style={{ paddingTop: 7, paddingBottom: 7, paddingLeft: 8, paddingRight: 8 }}
    >
      <motion.div
        key={status}
        className="flex"
        initial={{ x: 0 }}
        animate={{ x: animPx > 0 ? [0, -animPx] : 0 }}
        transition={{ duration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
      >
        {Array.from({ length: numCopies }, (_, i) => (
          <span
            key={i}
            ref={i === 0 ? itemRef : undefined}
            className="inline-flex items-center flex-shrink-0 whitespace-nowrap pr-2"
            style={{ gap: 4 }}
          >
            <MessageIcon style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />
            <span className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none">
              &ldquo;{status}&rdquo;
            </span>
          </span>
        ))}
      </motion.div>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({ profile, size = 40 }: { profile: FriendProfile | null; size?: number }) {
  return (
    <div
      className="flex-shrink-0 relative overflow-hidden bg-border"
      style={{ width: size, height: size }}
    >
      {profile?.avatar_url ? (
        <Image
          src={resolveAvatarUrl(profile.avatar_url, size)}
          alt={profile.username}
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized={isSupabaseStorage(profile.avatar_url)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-pixel text-[10px] text-primary">
          {profile?.username[0]?.toUpperCase() ?? '?'}
        </div>
      )}
    </div>
  )
}

// ─── Friend card ─────────────────────────────────────────────────────────────

function FriendCard({
  entry,
  onTap,
}: {
  entry:   FriendEntry
  onTap:   () => void
}) {
  const status = entry.profile?.status

  return (
    <div className="flex flex-col overflow-hidden" style={{ gap: 'var(--space-3)' }}>
      {/* Details row */}
      <div className="flex items-center overflow-hidden" style={{ gap: 'var(--space-5)' }}>
        <button
          className="flex-shrink-0 active:opacity-70"
          onClick={onTap}
          aria-label={`Open DM with ${entry.profile?.username}`}
        >
          <UserAvatar profile={entry.profile} size={40} />
        </button>

        <button
          className="flex-1 min-w-0 flex flex-col text-left active:opacity-70"
          style={{ gap: 'var(--space-2)', letterSpacing: '0.2px' }}
          onClick={onTap}
        >
          <span
            className="font-body font-semibold text-[length:var(--text-md)] text-primary leading-normal truncate"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            {entry.profile?.username ?? '—'}
          </span>
          <span className="font-silkscreen text-[length:var(--text-xxs)] text-tertiary leading-normal">
            est.{friendshipYear(entry.friendship.created_at)}
          </span>
        </button>

        {/* DM icon */}
        <button
          onClick={onTap}
          className="flex-shrink-0 active:opacity-70"
          aria-label={`Message ${entry.profile?.username}`}
        >
          <MailRight style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
        </button>
      </div>

      {/* Status ticker */}
      {status && <StatusTicker status={status} />}
    </div>
  )
}

// ─── FriendsClient ────────────────────────────────────────────────────────────

export function FriendsClient({
  userId,
  isGuest,
  friends:      initialFriends,
  pendingCount,
}: FriendsClientProps) {
  const router = useRouter()

  const [friends,       setFriends]       = useState<FriendEntry[]>(initialFriends)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([])
  const [isSearching,   setIsSearching]   = useState(false)
  const [loadingIds,    setLoadingIds]    = useState<Set<string>>(new Set())
  const [googleLoading, setGoogleLoading] = useState(false)

  const showSearch = searchQuery.trim().length >= 2

  // Debounced username search
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) { setSearchResults([]); setIsSearching(false); return }
    setIsSearching(true)
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, avatar_class, status')
          .ilike('username', `%${q}%`)
          .neq('id', userId)
          .limit(8)
        setSearchResults((data ?? []) as FriendProfile[])
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => { clearTimeout(timer); setIsSearching(false) }
  }, [searchQuery, userId])

  function getRelationship(profileId: string): 'friend' | 'none' {
    if (friends.some((e) => e.profile?.id === profileId)) return 'friend'
    return 'none'
  }

  function addLoading(id: string)    { setLoadingIds((p) => new Set(p).add(id)) }
  function removeLoading(id: string) { setLoadingIds((p) => { const s = new Set(p); s.delete(id); return s }) }

  const handleSendRequest = useCallback(async (profile: FriendProfile) => {
    if (isGuest) return
    addLoading(profile.id)
    try {
      await sendFriendRequestAction(profile.id)
    } finally {
      removeLoading(profile.id)
    }
  }, [isGuest]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleSignIn = useCallback(async () => {
    setGoogleLoading(true)
    try { await signInWithGoogle() } catch { setGoogleLoading(false) }
  }, [])

  return (
    <SlidePage className="min-h-screen bg-black flex flex-col" backHref="/home">

      {/* ── Header ── */}
      <div
        className="bg-black flex-shrink-0"
        style={{ paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingBottom: 'var(--space-3)', paddingTop: 'max(env(safe-area-inset-top), var(--space-3))' }}
      >
        <div className="flex items-center justify-between h-10">
          <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
            <BackButton />
            <span className="font-silkscreen text-[length:var(--text-xxl)] text-primary uppercase leading-none">
              Friends
            </span>
          </div>
          <button
            className="relative flex-shrink-0"
            style={{ width: 24, height: 24 }}
            onClick={() => router.push('/friends/inbox')}
            aria-label="Inbox"
          >
            <Inbox style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
            {pendingCount > 0 && (
              <span
                className="absolute top-0 right-0 rounded-full"
                style={{ width: 8, height: 8, background: 'var(--color-coins)' }}
                aria-label={`${pendingCount} pending requests`}
              />
            )}
          </button>
        </div>
      </div>

      {/* ── Guest banner ── */}
      {isGuest && (
        <div className="mx-4 mt-4 bg-surface border border-purple/30 p-4 flex items-center justify-between gap-4">
          <p className="font-pixel text-[7px] text-muted leading-relaxed flex-1">
            SIGN IN WITH GOOGLE<br />TO ADD FRIENDS
          </p>
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="bg-purple px-4 py-2 font-pixel text-[7px] text-black whitespace-nowrap disabled:opacity-50"
          >
            {googleLoading ? '...' : 'SIGN IN'}
          </button>
        </div>
      )}

      {/* ── Body ── */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{ paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-5)', gap: 'var(--space-5)' }}
      >

        {/* Search input */}
        <div
          className="border border-border flex items-center flex-shrink-0"
          style={{ height: 48, gap: 'var(--space-3)', paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingTop: 12, paddingBottom: 12 }}
        >
          <Search className="flex-shrink-0" style={{ width: 16, height: 16, color: 'var(--color-muted)' }} aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by @username"
            className="flex-1 bg-transparent font-body text-[length:var(--text-sm)] text-primary placeholder:text-muted focus:outline-none"
            style={{ fontVariationSettings: '"opsz" 14' }}
          />
          {isSearching && <span className="font-pixel text-[7px] text-muted flex-shrink-0">...</span>}
        </div>

        {/* ── Search results ── */}
        {showSearch ? (
          <div className="flex flex-col" style={{ gap: 'var(--space-5)' }}>
            {searchResults.length === 0 && !isSearching ? (
              <p className="font-pixel text-[8px] text-muted py-4 text-center">NO USERS FOUND</p>
            ) : (
              searchResults.map((profile) => {
                const rel     = getRelationship(profile.id)
                const loading = loadingIds.has(profile.id)
                return (
                  <div
                    key={profile.id}
                    className="flex flex-col overflow-hidden"
                    style={{ gap: 'var(--space-3)' }}
                  >
                    <div className="flex items-center overflow-hidden" style={{ gap: 'var(--space-5)' }}>
                      <UserAvatar profile={profile} size={40} />
                      <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--space-2)', letterSpacing: '0.2px' }}>
                        <span
                          className="font-body font-semibold text-[length:var(--text-md)] text-primary leading-normal truncate"
                          style={{ fontVariationSettings: '"opsz" 14' }}
                        >
                          {profile.username}
                        </span>
                        <span className="font-silkscreen text-[length:var(--text-xxs)] text-tertiary leading-normal">
                          @{profile.username.toLowerCase()}
                        </span>
                      </div>
                      {rel === 'friend' ? (
                        <span className="font-pixel text-[7px] text-[#66bb6a] flex-shrink-0">FRIENDS</span>
                      ) : (
                        <button
                          disabled={isGuest || loading}
                          onClick={() => handleSendRequest(profile)}
                          className="bg-purple flex items-center justify-center overflow-hidden flex-shrink-0 disabled:opacity-50 active:opacity-70"
                          style={{ paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingTop: 'var(--space-4)', paddingBottom: 'var(--space-4)' }}
                        >
                          <span className="font-silkscreen text-[length:var(--text-xxs)] text-primary whitespace-nowrap leading-none">
                            {loading ? '...' : 'ADD +'}
                          </span>
                        </button>
                      )}
                    </div>
                    {profile.status && <StatusTicker status={profile.status} />}
                  </div>
                )
              })
            )}
          </div>
        ) : (
          /* ── Friends list ── */
          <div className="flex flex-col" style={{ gap: 'var(--space-5)' }}>
            {friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="font-pixel text-[9px] text-primary mb-3">NO FRIENDS YET</p>
                <p className="font-pixel text-[7px] text-muted leading-relaxed">
                  Search for players above<br />to add them to your party.
                </p>
              </div>
            ) : (
              friends.map((entry) => (
                <FriendCard
                  key={entry.friendship.id}
                  entry={entry}
                  onTap={() => { if (entry.profile) router.push(`/dm/${entry.profile.id}`) }}
                />
              ))
            )}
          </div>
        )}
      </div>
    </SlidePage>
  )
}
