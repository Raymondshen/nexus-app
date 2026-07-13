'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { SlidePage } from '@/app/layouts/SlidePage'
import { Upload } from 'pixelarticons/react/Upload'
import { DiamondGem } from 'pixelarticons/react/DiamondGem'
import { TokeCircle } from 'pixelarticons/react/TokeCircle'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { InputField } from '@/shared/components/ui/InputField'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { PageFooter } from '@/shared/components/ui/PageFooter'
import { Button } from '@/shared/components/ui/Button'
import { validateUsernameFormat } from '@/shared/utils/username'
import { revalidateProfileAction, updateProfileDetailsAction } from '@/app/(app)/profile/actions'
import { AvatarUploadModal } from '@/shared/components/overlays/AvatarUploadModal'
import { BackgroundUploadModal } from '@/shared/components/overlays/BackgroundUploadModal'

export interface ManageUserProfileProps {
  userId:          string
  userEmail:       string
  initialUsername: string
  initialStatus:   string | null
  avatarUrl:       string | null
  backgroundUrl:   string | null
  isDev:           boolean
  totalMessages:   number
  coins:           number
  gemBalance:      number
}

// ─── ManageUserProfile ────────────────────────────────────────────────────────

export function ManageUserProfile({
  userId,
  userEmail,
  initialUsername,
  initialStatus,
  avatarUrl,
  backgroundUrl,
  isDev,
  totalMessages,
  coins,
  gemBalance,
}: ManageUserProfileProps) {
  const router = useRouter()

  const [localAvatarUrl,     setLocalAvatarUrl]     = useState(avatarUrl)
  const [localBackgroundUrl, setLocalBackgroundUrl] = useState(backgroundUrl)
  const [displayName,        setDisplayName]        = useState(initialUsername)
  const [status,             setStatus]             = useState(initialStatus ?? '')
  const [saving,             setSaving]             = useState(false)
  const [saveError,          setSaveError]          = useState<string | null>(null)

  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [pendingBgFile,     setPendingBgFile]     = useState<File | null>(null)
  const avatarFileInputRef = useRef<HTMLInputElement>(null)
  const bgFileInputRef     = useRef<HTMLInputElement>(null)

  const msgFormatted = totalMessages.toLocaleString()

  async function handleSave() {
    const trimmed = displayName.trim()
    const formatError = validateUsernameFormat(trimmed)
    if (formatError) { setSaveError(formatError); return }
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await updateProfileDetailsAction(trimmed, status.trim())
      if (result.error === 'taken') { setSaveError('Name already taken'); return }
      if (result.error) { setSaveError(result.error); return }
      await revalidateProfileAction()
      router.back()
    } catch {
      setSaveError('Failed to save — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      <PageHeader title="Manage Profile" />

      <div className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col">

        {/* Hero */}
        <div
          className="relative flex flex-col justify-end overflow-hidden flex-shrink-0 w-full"
          style={{ height: 240, padding: 16 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={localBackgroundUrl ?? '/img/default_image.png'}
            alt=""
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'var(--gradient-image-overlay)' }}
          />

          <div className="relative flex items-center w-full" style={{ gap: 16 }}>
            <UserAvatar avatarUrl={localAvatarUrl} username={displayName || initialUsername} size={56} bg="primary" priority />

            <div className="flex-1 min-w-0 flex flex-col justify-center leading-none" style={{ gap: 4 }}>
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                Lifetime msg. {msgFormatted}
              </p>
              <p className="font-body font-bold truncate" style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
                {displayName.trim() || initialUsername}
              </p>

              {/* Currency pills */}
              <div className="flex items-center" style={{ gap: 8 }}>
                <div className="flex items-center" style={{ gap: 4 }}>
                  <DiamondGem style={{ width: 12, height: 12, color: 'var(--color-purple)' }} aria-hidden="true" />
                  <span
                    className="font-silkscreen leading-none"
                    style={{
                      fontSize:             'var(--text-xxs)',
                      background:           'linear-gradient(to right, var(--color-purple), #d946ef)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor:  'transparent',
                      backgroundClip:       'text',
                    }}
                  >
                    {gemBalance}
                  </span>
                </div>
                <div className="w-[2px] h-[2px] bg-border-hover flex-shrink-0" aria-hidden="true" />
                <div className="flex items-center" style={{ gap: 4 }}>
                  <TokeCircle style={{ width: 12, height: 12, color: 'var(--color-coins)' }} aria-hidden="true" />
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-coins)' }}>
                    {coins.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status ticker */}
        <TickerBanner text={status.trim() || 'Whats the mood today...'} />

        {/* Body */}
        <div className="flex flex-col w-full" style={{ gap: 20, paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16 }}>

          {/* Account (read-only) */}
          <div className="flex flex-col w-full" style={{ gap: 8 }}>
            <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
              Account
            </p>
            <div
              className="w-full border h-[50px] flex items-center overflow-hidden"
              style={{ borderColor: 'var(--color-border-hover)', paddingLeft: 16, paddingRight: 16 }}
            >
              <p className="font-body font-normal leading-normal truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}>
                {userEmail}
              </p>
            </div>
          </div>

          {/* Profile Photo / Background Image upload buttons */}
          <div className="flex w-full" style={{ gap: 16 }}>
            <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
              <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                Profile Photo
              </p>
              <button
                type="button"
                onClick={() => avatarFileInputRef.current?.click()}
                className="flex items-center justify-center w-full h-12 border border-[var(--color-purple)] active:opacity-70 transition-opacity"
                style={{ gap: 8 }}
              >
                <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                <span className="font-silkscreen leading-none pb-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}>
                  Upload
                </span>
              </button>
            </div>

            <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
              <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                Background Image
              </p>
              <button
                type="button"
                onClick={() => bgFileInputRef.current?.click()}
                className="flex items-center justify-center w-full h-12 border border-[var(--color-purple)] active:opacity-70 transition-opacity"
                style={{ gap: 8 }}
              >
                <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                <span className="font-silkscreen leading-none pb-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}>
                  Upload
                </span>
              </button>
            </div>
          </div>

          <InputField
            label="Display Name"
            value={displayName}
            onChange={(v) => { setDisplayName(v); setSaveError(null) }}
            placeholder="your display name"
            maxLength={20}
          />

          <InputField
            label="Status"
            value={status}
            onChange={(v) => setStatus(v.slice(0, 100))}
            placeholder="Whats the mood today..."
            maxLength={100}
          />

          {saveError && (
            <p className="font-pixel text-[8px] text-[#ef4444]">{saveError}</p>
          )}
        </div>

      </div>

      <PageFooter>
        <Button
          onClick={handleSave}
          disabled={saving || !displayName.trim() || displayName.trim().length < 3}
          loading={saving}
          className="w-full"
        >
          Save Changes
        </Button>
      </PageFooter>

      {/* Hidden avatar file input */}
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setPendingAvatarFile(f)
          e.target.value = ''
        }}
      />
      <AvatarUploadModal
        file={pendingAvatarFile}
        userId={userId}
        isDev={isDev}
        onClose={() => setPendingAvatarFile(null)}
        onSuccess={(url) => {
          setLocalAvatarUrl(url)
          setPendingAvatarFile(null)
        }}
      />

      {/* Hidden background file input */}
      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setPendingBgFile(f)
          e.target.value = ''
        }}
      />
      <BackgroundUploadModal
        file={pendingBgFile}
        userId={userId}
        isDev={isDev}
        onClose={() => setPendingBgFile(null)}
        onSuccess={(url) => {
          setLocalBackgroundUrl(url)
          setPendingBgFile(null)
        }}
      />

    </SlidePage>
  )
}
