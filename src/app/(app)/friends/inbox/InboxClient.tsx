'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Check } from 'pixelarticons/react/Check'
import { Close } from 'pixelarticons/react/Close'
import { acceptFriendRequestAction, deleteFriendshipAction } from '../actions'
import type { FriendProfile } from '@/types'
import type { FriendEntry } from '../FriendsClient'

function BackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: 24, height: 40 }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
    </button>
  )
}

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

interface InboxClientProps {
  incomingRequests: FriendEntry[]
  outgoingRequests: FriendEntry[]
}

export function InboxClient({ incomingRequests: initialIncoming, outgoingRequests: initialOutgoing }: InboxClientProps) {
  const [incoming,   setIncoming]   = useState<FriendEntry[]>(initialIncoming)
  const [outgoing,   setOutgoing]   = useState<FriendEntry[]>(initialOutgoing)
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())

  function addLoading(id: string)    { setLoadingIds((p) => new Set(p).add(id)) }
  function removeLoading(id: string) { setLoadingIds((p) => { const s = new Set(p); s.delete(id); return s }) }

  const handleAccept = useCallback(async (entry: FriendEntry) => {
    addLoading(entry.friendship.id)
    try {
      const result = await acceptFriendRequestAction(entry.friendship.id)
      if (!result.error) {
        setIncoming((prev) => prev.filter((e) => e.friendship.id !== entry.friendship.id))
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

  const handleCancel = useCallback(async (entry: FriendEntry) => {
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

  const isEmpty = incoming.length === 0 && outgoing.length === 0

  return (
    <SlidePage className="min-h-screen bg-black flex flex-col" backHref="/friends">

      {/* ── Header ── */}
      <div
        className="bg-black flex-shrink-0"
        style={{
          paddingLeft: 'var(--space-5)',
          paddingRight: 'var(--space-5)',
          paddingBottom: 'var(--space-3)',
          paddingTop: 'max(env(safe-area-inset-top), var(--space-3))',
        }}
      >
        <div className="flex items-center h-10" style={{ gap: 'var(--space-3)' }}>
          <BackButton />
          <span className="font-silkscreen text-[length:var(--text-xxl)] text-primary uppercase leading-none">
            Inbox
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          paddingLeft: 'var(--space-5)',
          paddingRight: 'var(--space-5)',
          paddingTop: 'var(--space-5)',
          paddingBottom: 'var(--space-5)',
          gap: 'var(--space-5)',
        }}
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-pixel text-[9px] text-primary mb-3">ALL CAUGHT UP</p>
            <p className="font-pixel text-[7px] text-muted leading-relaxed">
              No pending friend requests.
            </p>
          </div>
        ) : (
          <>
            {/* ── Incoming requests ── */}
            {incoming.map((entry) => {
              const loading = loadingIds.has(entry.friendship.id)
              return (
                <div
                  key={entry.friendship.id}
                  className="flex flex-col overflow-hidden"
                  style={{
                    background: 'rgba(17,17,17,0.5)',
                    border: '1px solid var(--color-surface)',
                    borderRadius: 'var(--space-3)',
                    padding: 'var(--space-5)',
                    gap: 'var(--space-5)',
                  }}
                >
                  {/* Profile details */}
                  <div className="flex items-center overflow-hidden" style={{ gap: 'var(--space-5)' }}>
                    <UserAvatar profile={entry.profile} size={40} />
                    <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--space-2)', letterSpacing: '0.2px' }}>
                      <span
                        className="font-body font-semibold text-[length:var(--text-md)] text-primary leading-normal truncate"
                        style={{ fontVariationSettings: '"opsz" 14' }}
                      >
                        {entry.profile?.username ?? '—'}
                      </span>
                      <span className="font-silkscreen text-[length:var(--text-xxs)] leading-normal" style={{ color: 'var(--color-coins)' }}>
                        wants to be your friend
                      </span>
                    </div>
                  </div>

                  {/* Accept / Decline buttons */}
                  <div className="flex items-center" style={{ gap: 'var(--space-5)' }}>
                    <button
                      disabled={loading}
                      onClick={() => handleAccept(entry)}
                      className="flex-1 flex items-center justify-center overflow-hidden disabled:opacity-50 active:opacity-70"
                      style={{
                        background: 'var(--green)',
                        boxShadow: '4px 4px 0px 0px rgba(34,197,94,0.5)',
                        gap: 'var(--space-2)',
                        paddingLeft: 'var(--space-5)',
                        paddingRight: 'var(--space-5)',
                        paddingTop: 'var(--space-4)',
                        paddingBottom: 'var(--space-4)',
                      }}
                    >
                      <Check style={{ width: 12, height: 12, color: 'white', flexShrink: 0 }} aria-hidden="true" />
                      <span className="font-silkscreen text-[length:var(--text-xxs)] text-primary whitespace-nowrap leading-none">
                        {loading ? '...' : 'accept'}
                      </span>
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => handleDecline(entry)}
                      className="flex-1 flex items-center justify-center overflow-hidden disabled:opacity-50 active:opacity-70"
                      style={{
                        background: 'var(--red)',
                        boxShadow: '4px 4px 0px 0px rgba(239,68,68,0.5)',
                        gap: 'var(--space-2)',
                        paddingLeft: 'var(--space-5)',
                        paddingRight: 'var(--space-5)',
                        paddingTop: 'var(--space-4)',
                        paddingBottom: 'var(--space-4)',
                      }}
                    >
                      <Close style={{ width: 12, height: 12, color: 'white', flexShrink: 0 }} aria-hidden="true" />
                      <span className="font-silkscreen text-[length:var(--text-xxs)] text-primary whitespace-nowrap leading-none">
                        {loading ? '...' : 'decline'}
                      </span>
                    </button>
                  </div>
                </div>
              )
            })}

            {/* ── Outgoing requests ── */}
            {outgoing.map((entry) => {
              const loading = loadingIds.has(entry.friendship.id)
              return (
                <div
                  key={entry.friendship.id}
                  className="flex flex-col overflow-hidden"
                  style={{
                    background: 'rgba(17,17,17,0.5)',
                    border: '1px solid var(--color-surface)',
                    borderRadius: 'var(--space-3)',
                    padding: 'var(--space-5)',
                    gap: 'var(--space-5)',
                  }}
                >
                  {/* Profile details */}
                  <div className="flex items-center overflow-hidden" style={{ gap: 'var(--space-5)' }}>
                    <UserAvatar profile={entry.profile} size={40} />
                    <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--space-2)', letterSpacing: '0.2px' }}>
                      <span
                        className="font-body font-semibold text-[length:var(--text-md)] text-primary leading-normal truncate"
                        style={{ fontVariationSettings: '"opsz" 14' }}
                      >
                        {entry.profile?.username ?? '—'}
                      </span>
                      <span className="font-silkscreen text-[length:var(--text-xxs)] leading-normal" style={{ color: 'var(--blue)' }}>
                        Sent Friend REQUEST
                      </span>
                    </div>
                  </div>

                  {/* Cancel request button */}
                  <button
                    disabled={loading}
                    onClick={() => handleCancel(entry)}
                    className="w-full flex items-center justify-center overflow-hidden disabled:opacity-50 active:opacity-70"
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--purple)',
                      boxShadow: '4px 4px 0px 0px rgba(168,85,247,0.5)',
                      gap: 'var(--space-2)',
                      paddingLeft: 'var(--space-5)',
                      paddingRight: 'var(--space-5)',
                      paddingTop: 'var(--space-4)',
                      paddingBottom: 'var(--space-4)',
                    }}
                  >
                    <Close style={{ width: 12, height: 12, color: 'var(--purple)', flexShrink: 0 }} aria-hidden="true" />
                    <span className="font-silkscreen text-[length:var(--text-xxs)] whitespace-nowrap leading-none" style={{ color: 'var(--purple)' }}>
                      {loading ? '...' : 'Cancel request'}
                    </span>
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>
    </SlidePage>
  )
}
