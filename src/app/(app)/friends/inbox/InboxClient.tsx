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
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
    </button>
  )
}

function UserAvatar({ profile, size = 48 }: { profile: FriendProfile | null; size?: number }) {
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

interface InboxCardPreviewProps {
  entry: FriendEntry
  variant: 'incoming' | 'outgoing'
  loading: boolean
  onAccept?: (entry: FriendEntry) => void
  onDecline?: (entry: FriendEntry) => void
  onCancel?: (entry: FriendEntry) => void
}

function InboxCardPreview({ entry, variant, loading, onAccept, onDecline, onCancel }: InboxCardPreviewProps) {
  return (
    <div className="flex items-center overflow-hidden" style={{ gap: 'var(--space-5)' }}>
      <UserAvatar profile={entry.profile} size={48} />

      <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--space-2)', letterSpacing: '0.2px' }}>
        <span
          className="font-body font-bold text-[length:var(--text-md)] text-primary leading-none truncate"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          {entry.profile?.username ?? '—'}
        </span>
        <span
          className="font-body font-normal text-[length:var(--text-sm)] leading-none"
          style={{ color: variant === 'outgoing' ? 'var(--yellow)' : 'var(--color-secondary)' }}
        >
          {variant === 'outgoing' ? 'Sent friend request' : 'Wants to be your friend'}
        </span>
      </div>

      {variant === 'incoming' ? (
        <div className="flex items-center flex-shrink-0" style={{ gap: 'var(--space-5)' }}>
          <button
            disabled={loading}
            onClick={() => onAccept?.(entry)}
            aria-label="Accept friend request"
            className="flex items-center justify-center overflow-hidden disabled:opacity-50 active:opacity-70"
            style={{
              background: 'var(--green)',
              borderRadius: 'var(--space-3)',
              padding: 'var(--space-4)',
            }}
          >
            <Check style={{ width: 16, height: 16, color: 'white' }} aria-hidden="true" />
          </button>
          <button
            disabled={loading}
            onClick={() => onDecline?.(entry)}
            aria-label="Decline friend request"
            className="flex items-center justify-center overflow-hidden disabled:opacity-50 active:opacity-70"
            style={{
              background: 'var(--red)',
              borderRadius: 'var(--space-3)',
              padding: 'var(--space-4)',
            }}
          >
            <Close style={{ width: 16, height: 16, color: 'white' }} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          disabled={loading}
          onClick={() => onCancel?.(entry)}
          aria-label="Cancel friend request"
          className="flex-shrink-0 flex items-center justify-center overflow-hidden disabled:opacity-50 active:opacity-70"
          style={{
            border: '1px solid var(--red)',
            borderRadius: 'var(--space-3)',
            padding: 'var(--space-4)',
          }}
        >
          <Close style={{ width: 16, height: 16, color: 'var(--red)' }} aria-hidden="true" />
        </button>
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
    <SlidePage className="min-h-screen bg-black flex flex-col">

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
            {incoming.map((entry) => (
              <InboxCardPreview
                key={entry.friendship.id}
                entry={entry}
                variant="incoming"
                loading={loadingIds.has(entry.friendship.id)}
                onAccept={handleAccept}
                onDecline={handleDecline}
              />
            ))}

            {incoming.length > 0 && outgoing.length > 0 && (
              <div className="border-t border-border" />
            )}

            {outgoing.map((entry) => (
              <InboxCardPreview
                key={entry.friendship.id}
                entry={entry}
                variant="outgoing"
                loading={loadingIds.has(entry.friendship.id)}
                onCancel={handleCancel}
              />
            ))}
          </>
        )}
      </div>
    </SlidePage>
  )
}
