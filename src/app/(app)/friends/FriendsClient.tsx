'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { Search } from 'pixelarticons/react/Search'
import { Check } from 'pixelarticons/react/Check'
import { Close } from 'pixelarticons/react/Close'
import { UserMinus } from 'pixelarticons/react/UserMinus'
import { createClient } from '@/lib/supabase/client'
import { signInWithGoogle } from '@/lib/supabase/auth'
import { sendFriendRequestAction, acceptFriendRequestAction, deleteFriendshipAction } from './actions'
import type { Friendship, FriendProfile } from '@/types'

export interface FriendEntry {
  friendship: Friendship
  profile:    FriendProfile | null
}

interface FriendsClientProps {
  userId:           string
  isGuest:          boolean
  friends:          FriendEntry[]
  incomingRequests: FriendEntry[]
  outgoingRequests: FriendEntry[]
}

function friendshipYear(iso: string): string {
  try { return new Date(iso).getFullYear().toString() } catch { return '' }
}

function UserAvatar({ profile, size = 40 }: { profile: FriendProfile | null; size?: number }) {
  return (
    <div
      className="flex-shrink-0 relative overflow-hidden bg-border"
      style={{ width: size, height: size }}
    >
      {profile?.avatar_url ? (
        <Image
          src={profile.avatar_url}
          alt={profile.username}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-pixel text-[10px] text-primary">
          {profile?.username[0]?.toUpperCase() ?? '?'}
        </div>
      )}
    </div>
  )
}

export function FriendsClient({
  userId,
  isGuest,
  friends:          initialFriends,
  incomingRequests: initialIncoming,
  outgoingRequests: initialOutgoing,
}: FriendsClientProps) {
  const router = useRouter()
  const goBack = useSlideBack()

  const [friends,       setFriends]       = useState<FriendEntry[]>(initialFriends)
  const [incoming,      setIncoming]      = useState<FriendEntry[]>(initialIncoming)
  const [outgoing,      setOutgoing]      = useState<FriendEntry[]>(initialOutgoing)
  const [requestsOpen,  setRequestsOpen]  = useState(true)

  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([])
  const [isSearching,   setIsSearching]   = useState(false)
  const [loadingIds,    setLoadingIds]    = useState<Set<string>>(new Set())
  const [googleLoading, setGoogleLoading] = useState(false)

  const hasRequests = incoming.length > 0 || outgoing.length > 0
  const showSearch  = searchQuery.trim().length >= 2

  // Debounced user search
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, avatar_class')
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

  function getRelationship(profileId: string): 'friend' | 'pending_sent' | 'pending_received' | 'none' {
    if (friends.some((e)  => e.profile?.id === profileId)) return 'friend'
    if (outgoing.some((e) => e.profile?.id === profileId)) return 'pending_sent'
    if (incoming.some((e) => e.profile?.id === profileId)) return 'pending_received'
    return 'none'
  }

  function addLoading(id: string)    { setLoadingIds((p) => new Set(p).add(id)) }
  function removeLoading(id: string) { setLoadingIds((p) => { const s = new Set(p); s.delete(id); return s }) }

  const handleSendRequest = useCallback(async (profile: FriendProfile) => {
    if (isGuest) return
    addLoading(profile.id)
    try {
      const result = await sendFriendRequestAction(profile.id)
      if (!result.error) {
        const tempFriendship: Friendship = {
          id:           `temp-${profile.id}`,
          requester_id: userId,
          addressee_id: profile.id,
          status:       'pending',
          created_at:   new Date().toISOString(),
        }
        setOutgoing((prev) => [...prev, { friendship: tempFriendship, profile }])
      }
    } finally {
      removeLoading(profile.id)
    }
  }, [isGuest, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = useCallback(async (entry: FriendEntry) => {
    addLoading(entry.friendship.id)
    try {
      const result = await acceptFriendRequestAction(entry.friendship.id)
      if (!result.error) {
        setIncoming((prev) => prev.filter((e) => e.friendship.id !== entry.friendship.id))
        setFriends((prev) => [...prev, { friendship: { ...entry.friendship, status: 'accepted' }, profile: entry.profile }])
      }
    } finally {
      removeLoading(entry.friendship.id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDecline = useCallback(async (entry: FriendEntry) => {
    addLoading(entry.friendship.id)
    try {
      const result = await deleteFriendshipAction(entry.friendship.id)
      if (!result.error) {
        setIncoming((prev) => prev.filter((e) => e.friendship.id !== entry.friendship.id))
      }
    } finally {
      removeLoading(entry.friendship.id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveFriend = useCallback(async (entry: FriendEntry) => {
    addLoading(entry.friendship.id)
    try {
      const result = await deleteFriendshipAction(entry.friendship.id)
      if (!result.error) {
        setFriends((prev) => prev.filter((e) => e.friendship.id !== entry.friendship.id))
      }
    } finally {
      removeLoading(entry.friendship.id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancelOutgoing = useCallback(async (entry: FriendEntry) => {
    addLoading(entry.friendship.id)
    try {
      const result = await deleteFriendshipAction(entry.friendship.id)
      if (!result.error) {
        setOutgoing((prev) => prev.filter((e) => e.friendship.id !== entry.friendship.id))
      }
    } finally {
      removeLoading(entry.friendship.id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleSignIn = useCallback(async () => {
    setGoogleLoading(true)
    try { await signInWithGoogle() } catch { setGoogleLoading(false) }
  }, [])

  return (
    <SlidePage className="min-h-screen bg-black flex flex-col" backHref="/home">

      {/* ── Header ── */}
      <div
        className="border-b border-border px-4 pb-2 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="flex items-center justify-between h-10">
          <div className="flex items-center gap-2">
            <button
              onClick={goBack}
              aria-label="Back"
              className="flex items-center justify-center flex-shrink-0 h-10"
              style={{ width: 44 }}
            >
              <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
            </button>
            <h1 className="font-pixel text-[18px] text-primary whitespace-nowrap">FRIENDS</h1>
          </div>
          <div style={{ width: 64, height: 24 }} />
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
      <div className="flex-1 overflow-y-auto nexus-scroll px-4 py-4 flex flex-col gap-6">

        {/* Search input */}
        <div className="border border-border h-[48px] flex items-center gap-2 px-4 py-[12px]">
          <Search className="flex-shrink-0" style={{ width: 16, height: 16, color: 'var(--color-muted)' }} aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by @username"
            className="flex-1 bg-transparent font-body text-[14px] text-primary placeholder:text-muted focus:outline-none"
            style={{ fontVariationSettings: '"opsz" 14' }}
          />
          {isSearching && <span className="font-pixel text-[7px] text-muted flex-shrink-0">...</span>}
        </div>

        {/* ── Search results ── */}
        {showSearch ? (
          <div className="flex flex-col gap-4">
            <p className="font-silkscreen text-[14px] text-primary tracking-[0.2px] leading-normal">Results</p>
            {searchResults.length === 0 && !isSearching ? (
              <p className="font-pixel text-[8px] text-muted py-4 text-center">NO USERS FOUND</p>
            ) : (
              <div className="flex flex-col gap-4">
                {searchResults.map((profile) => {
                  const rel     = getRelationship(profile.id)
                  const loading = loadingIds.has(profile.id)
                  const incomingEntry = rel === 'pending_received'
                    ? (incoming.find((e) => e.profile?.id === profile.id) ?? null)
                    : null

                  return (
                    <div key={profile.id} className="flex items-center gap-4 overflow-hidden">
                      <UserAvatar profile={profile} size={40} />
                      <div className="flex-1 min-w-0 flex flex-col tracking-[0.2px]">
                        <span
                          className="font-body font-semibold text-[16px] text-primary leading-normal truncate"
                          style={{ fontVariationSettings: '"opsz" 14' }}
                        >
                          {profile.username}
                        </span>
                        <span className="font-silkscreen text-[11px] text-tertiary leading-normal">
                          @{profile.username.toLowerCase()}
                        </span>
                      </div>
                      {rel === 'friend' && (
                        <span className="font-pixel text-[7px] text-[#66bb6a] flex-shrink-0">FRIENDS</span>
                      )}
                      {rel === 'pending_sent' && (
                        <span className="font-pixel text-[7px] text-muted flex-shrink-0">PENDING</span>
                      )}
                      {rel === 'pending_received' && incomingEntry && (
                        <button
                          disabled={loading}
                          onClick={() => handleAccept(incomingEntry)}
                          className="w-[32px] h-[32px] bg-[#22c55e] flex items-center justify-center flex-shrink-0 overflow-hidden disabled:opacity-50"
                          aria-label="Accept"
                        >
                          <Check style={{ width: 16, height: 16, color: '#ffffff' }} aria-hidden="true" />
                        </button>
                      )}
                      {rel === 'none' && (
                        <button
                          disabled={isGuest || loading}
                          onClick={() => handleSendRequest(profile)}
                          className="bg-purple flex items-center justify-center overflow-hidden px-4 py-3 flex-shrink-0 disabled:opacity-50"
                        >
                          <span className="font-silkscreen text-[11px] text-primary whitespace-nowrap leading-none">
                            {loading ? '...' : 'ADD +'}
                          </span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── Requests section ── */}
            {hasRequests && (
              <div className="flex flex-col gap-4">
                {/* Section title */}
                <div className="flex items-center justify-between">
                  <p className="font-silkscreen text-[14px] text-primary tracking-[0.2px] leading-normal">Requests</p>
                  <button
                    onClick={() => setRequestsOpen((o) => !o)}
                    className="flex items-center justify-center"
                    style={{ width: 24, height: 16 }}
                    aria-label={requestsOpen ? 'Collapse requests' : 'Expand requests'}
                  >
                    <motion.div
                      style={{ display: 'block', width: 24, height: 16 }}
                      animate={{ rotate: requestsOpen ? 90 : 0 }}
                      transition={{ duration: 0.18, ease: 'easeInOut' }}
                    >
                      <ChevronRight style={{ width: 24, height: 16, color: 'var(--color-muted)' }} aria-hidden="true" />
                    </motion.div>
                  </button>
                </div>

                {/* Collapsible content */}
                <AnimatePresence initial={false}>
                  {requestsOpen && (
                    <motion.div
                      key="requests-body"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden flex flex-col gap-4"
                    >
                      {/* Outgoing requests */}
                      {outgoing.map((entry) => {
                        const loading = loadingIds.has(entry.friendship.id)
                        return (
                          <div key={entry.friendship.id} className="flex items-center gap-4 overflow-hidden">
                            <UserAvatar profile={entry.profile} size={40} />
                            <div className="flex-1 min-w-0 flex flex-col tracking-[0.2px]">
                              <span
                                className="font-body font-semibold text-[16px] text-primary leading-normal truncate"
                                style={{ fontVariationSettings: '"opsz" 14' }}
                              >
                                {entry.profile?.username ?? '—'}
                              </span>
                              <span className="font-silkscreen text-[11px] text-tertiary leading-normal">
                                Sent Friend Request
                              </span>
                            </div>
                            <button
                              disabled={loading}
                              onClick={() => handleCancelOutgoing(entry)}
                              className="bg-purple flex items-center justify-center gap-2 overflow-hidden px-4 py-3 flex-shrink-0 disabled:opacity-50 active:opacity-70"
                            >
                              <Close style={{ width: 12, height: 12, color: '#ffffff' }} aria-hidden="true" />
                              <span className="font-silkscreen text-[11px] text-primary whitespace-nowrap leading-none">
                                {loading ? '...' : 'CANCEL'}
                              </span>
                            </button>
                          </div>
                        )
                      })}

                      {/* Incoming requests */}
                      {incoming.map((entry) => {
                        const loading = loadingIds.has(entry.friendship.id)
                        return (
                          <div key={entry.friendship.id} className="flex items-center gap-4 overflow-hidden">
                            <UserAvatar profile={entry.profile} size={40} />
                            <div className="flex-1 min-w-0 flex flex-col tracking-[0.2px]">
                              <span
                                className="font-body font-semibold text-[16px] text-primary leading-normal truncate"
                                style={{ fontVariationSettings: '"opsz" 14' }}
                              >
                                {entry.profile?.username ?? '—'}
                              </span>
                              <span className="font-silkscreen text-[11px] text-tertiary leading-normal">
                                Wants to be your friend
                              </span>
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
                              <button
                                disabled={loading}
                                onClick={() => handleAccept(entry)}
                                className="w-[32px] h-[32px] bg-[#22c55e] flex items-center justify-center overflow-hidden disabled:opacity-50 active:opacity-70"
                                aria-label="Accept"
                              >
                                <Check style={{ width: 16, height: 16, color: '#ffffff' }} aria-hidden="true" />
                              </button>
                              <button
                                disabled={loading}
                                onClick={() => handleDecline(entry)}
                                className="w-[32px] h-[32px] bg-[#ef4444] flex items-center justify-center overflow-hidden disabled:opacity-50 active:opacity-70"
                                aria-label="Decline"
                              >
                                <Close style={{ width: 12, height: 12, color: '#ffffff' }} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── Friends section ── */}
            <div className="flex flex-col gap-4">
              <p className="font-silkscreen text-[14px] text-primary tracking-[0.2px] leading-normal">Friends</p>
              {friends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="font-pixel text-[9px] text-primary mb-3">NO FRIENDS YET</p>
                  <p className="font-pixel text-[7px] text-muted leading-relaxed">
                    Search for players above<br />to add them to your party.
                  </p>
                </div>
              ) : (
                friends.map((entry) => {
                  const loading = loadingIds.has(entry.friendship.id)
                  return (
                    <div
                      key={entry.friendship.id}
                      className="flex items-center gap-4 overflow-hidden cursor-pointer"
                      onClick={() => { if (!loading && entry.profile) router.push(`/dm/${entry.profile.id}`) }}
                    >
                      <UserAvatar profile={entry.profile} size={40} />
                      <div className="flex-1 min-w-0 flex flex-col tracking-[0.2px]">
                        <span
                          className="font-body font-semibold text-[16px] text-primary leading-normal truncate"
                          style={{ fontVariationSettings: '"opsz" 14' }}
                        >
                          {entry.profile?.username ?? '—'}
                        </span>
                        <span className="font-silkscreen text-[11px] text-tertiary leading-normal">
                          est. {friendshipYear(entry.friendship.created_at)}
                        </span>
                      </div>
                      <ChevronRight
                        style={{ width: 24, height: 24, color: 'var(--color-tertiary)', flexShrink: 0 }}
                        aria-hidden="true"
                      />
                      <button
                        disabled={loading}
                        onClick={(e) => { e.stopPropagation(); handleRemoveFriend(entry) }}
                        aria-label="Remove friend"
                        className="bg-[#ef4444] flex items-center justify-center gap-[4px] overflow-hidden px-4 py-3 flex-shrink-0 disabled:opacity-50 active:opacity-70"
                      >
                        <UserMinus style={{ width: 12, height: 12, color: '#ffffff' }} aria-hidden="true" />
                        <span className="font-silkscreen text-[11px] text-primary whitespace-nowrap leading-none">
                          {loading ? '...' : 'Remove'}
                        </span>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </SlidePage>
  )
}
