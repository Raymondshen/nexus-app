'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
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

  const [friends,  setFriends]  = useState<FriendEntry[]>(initialFriends)
  const [incoming, setIncoming] = useState<FriendEntry[]>(initialIncoming)
  const [outgoing, setOutgoing] = useState<FriendEntry[]>(initialOutgoing)
  const [tab,      setTab]      = useState<'friends' | 'requests'>('friends')

  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([])
  const [isSearching,   setIsSearching]   = useState(false)
  const [loadingIds,    setLoadingIds]    = useState<Set<string>>(new Set())
  const [googleLoading, setGoogleLoading] = useState(false)

  const requestCount    = incoming.length
  const showSearch      = searchQuery.trim().length >= 2

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
    <div className="min-h-screen bg-black flex flex-col">

      {/* ── Header ── */}
      <div
        className="border-b border-border px-4 pb-4 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}
      >
        <div className="flex items-center gap-4 h-10">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 24, height: 40 }}
          >
            <i className="hn hn-angle-right" style={{ fontSize: 18, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>
          <h1 className="font-pixel text-[14px] text-primary flex-1">FRIENDS</h1>
          {friends.length > 0 && (
            <span className="font-silkscreen text-[8px] text-muted">{friends.length}</span>
          )}
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

      {/* ── Search ── */}
      <div className="px-4 pt-4">
        <div className="bg-surface border border-border flex items-center gap-3 px-3 h-10">
          <i className="hn hn-search" style={{ fontSize: 13, color: 'var(--color-muted)' }} aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="SEARCH BY USERNAME..."
            className="flex-1 bg-transparent font-silkscreen text-[9px] text-primary placeholder:text-muted focus:outline-none"
            style={{ fontSize: 9 }}
          />
          {isSearching && <span className="font-pixel text-[7px] text-muted">...</span>}
        </div>
      </div>

      {/* ── Search results ── */}
      {showSearch && (
        <div className="px-4 mt-3 flex flex-col flex-1 overflow-y-auto">
          <p className="font-silkscreen text-[7px] text-muted mb-2">RESULTS</p>
          {searchResults.length === 0 && !isSearching ? (
            <p className="font-pixel text-[7px] text-muted py-6 text-center">NO USERS FOUND</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {searchResults.map((profile) => {
                const rel     = getRelationship(profile.id)
                const loading = loadingIds.has(profile.id)
                const incomingEntry = rel === 'pending_received'
                  ? (incoming.find((e) => e.profile?.id === profile.id) ?? null)
                  : null

                return (
                  <div key={profile.id} className="flex items-center gap-3 py-3">
                    <UserAvatar profile={profile} size={36} />
                    <span
                      className="flex-1 font-body font-bold text-[14px] text-primary truncate"
                      style={{ fontVariationSettings: '"opsz" 14' }}
                    >
                      {profile.username}
                    </span>
                    {rel === 'friend' && (
                      <span className="font-pixel text-[7px] text-[#66bb6a]">FRIENDS</span>
                    )}
                    {rel === 'pending_sent' && (
                      <span className="font-pixel text-[7px] text-muted">PENDING</span>
                    )}
                    {rel === 'pending_received' && incomingEntry && (
                      <button
                        disabled={loading}
                        onClick={() => handleAccept(incomingEntry)}
                        className="font-pixel text-[7px] text-[#66bb6a] border border-[#66bb6a]/40 px-3 py-1.5 disabled:opacity-50"
                      >
                        {loading ? '...' : 'ACCEPT'}
                      </button>
                    )}
                    {rel === 'none' && (
                      <button
                        disabled={isGuest || loading}
                        onClick={() => handleSendRequest(profile)}
                        className="font-pixel text-[7px] text-purple border border-purple/40 px-3 py-1.5 disabled:opacity-50"
                      >
                        {loading ? '...' : 'ADD +'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tabs + content (hidden while searching) ── */}
      {!showSearch && (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-border mt-4 flex-shrink-0">
            <button
              onClick={() => setTab('friends')}
              className={`flex-1 py-3 font-pixel text-[9px] transition-colors ${
                tab === 'friends'
                  ? 'text-primary border-b-2 border-purple -mb-px'
                  : 'text-muted'
              }`}
            >
              FRIENDS{friends.length > 0 ? ` (${friends.length})` : ''}
            </button>
            <button
              onClick={() => setTab('requests')}
              className={`flex-1 py-3 font-pixel text-[9px] transition-colors ${
                tab === 'requests'
                  ? 'text-primary border-b-2 border-purple -mb-px'
                  : 'text-muted'
              }`}
            >
              REQUESTS{requestCount > 0 ? ` (${requestCount})` : ''}
            </button>
          </div>

          {/* Friends list */}
          {tab === 'friends' && (
            <div className="flex-1 overflow-y-auto px-4">
              {friends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="font-pixel text-[9px] text-primary mb-3">NO FRIENDS YET</p>
                  <p className="font-pixel text-[7px] text-muted leading-relaxed">
                    Search for players above<br />to add them to your party.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {friends.map((entry) => (
                    <div key={entry.friendship.id} className="flex items-center gap-3 py-3">
                      <UserAvatar profile={entry.profile} size={40} />
                      <span
                        className="flex-1 font-body font-bold text-[15px] text-primary truncate"
                        style={{ fontVariationSettings: '"opsz" 14' }}
                      >
                        {entry.profile?.username ?? '—'}
                      </span>
                      <button
                        disabled={loadingIds.has(entry.friendship.id)}
                        onClick={() => handleRemoveFriend(entry)}
                        aria-label="Remove friend"
                        className="text-muted hover:text-[#ff4444] transition-colors disabled:opacity-40"
                      >
                        <i className="hn hn-user-minus" style={{ fontSize: 16 }} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Requests list */}
          {tab === 'requests' && (
            <div className="flex-1 overflow-y-auto px-4">
              {incoming.length === 0 && outgoing.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="font-pixel text-[9px] text-primary mb-3">NO PENDING REQUESTS</p>
                  <p className="font-pixel text-[7px] text-muted leading-relaxed">
                    Friend requests you send or<br />receive will appear here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-6 py-4">
                  {incoming.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="font-silkscreen text-[7px] text-muted">INCOMING</p>
                      <div className="flex flex-col divide-y divide-border">
                        {incoming.map((entry) => {
                          const loading = loadingIds.has(entry.friendship.id)
                          return (
                            <div key={entry.friendship.id} className="flex items-center gap-3 py-3">
                              <UserAvatar profile={entry.profile} size={40} />
                              <span
                                className="flex-1 font-body font-bold text-[15px] text-primary truncate"
                                style={{ fontVariationSettings: '"opsz" 14' }}
                              >
                                {entry.profile?.username ?? '—'}
                              </span>
                              <div className="flex gap-2">
                                <button
                                  disabled={loading}
                                  onClick={() => handleAccept(entry)}
                                  className="font-pixel text-[7px] text-[#66bb6a] border border-[#66bb6a]/40 px-3 py-1.5 disabled:opacity-50"
                                >
                                  {loading ? '...' : 'ACCEPT'}
                                </button>
                                <button
                                  disabled={loading}
                                  onClick={() => handleDecline(entry)}
                                  className="font-pixel text-[7px] text-[#ff4444] border border-[#ff4444]/40 px-3 py-1.5 disabled:opacity-50"
                                >
                                  {loading ? '...' : 'DENY'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {outgoing.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="font-silkscreen text-[7px] text-muted">SENT</p>
                      <div className="flex flex-col divide-y divide-border">
                        {outgoing.map((entry) => {
                          const loading = loadingIds.has(entry.friendship.id)
                          return (
                            <div key={entry.friendship.id} className="flex items-center gap-3 py-3">
                              <UserAvatar profile={entry.profile} size={40} />
                              <span
                                className="flex-1 font-body font-bold text-[15px] text-primary truncate"
                                style={{ fontVariationSettings: '"opsz" 14' }}
                              >
                                {entry.profile?.username ?? '—'}
                              </span>
                              <button
                                disabled={loading}
                                onClick={() => handleCancelOutgoing(entry)}
                                className="font-pixel text-[7px] text-muted border border-border px-3 py-1.5 disabled:opacity-50"
                              >
                                {loading ? '...' : 'CANCEL'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
