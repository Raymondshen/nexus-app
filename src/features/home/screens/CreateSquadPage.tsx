'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Area } from 'react-easy-crop'
import { Upload } from 'pixelarticons/react/Upload'
import { SlidePage } from '@/app/layouts/SlidePage'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { PageFooter } from '@/shared/components/ui/PageFooter'
import { InputField } from '@/shared/components/ui/InputField'
import { Button } from '@/shared/components/ui/Button'
import { PhotoCropModal } from '@/shared/components/ui/PhotoCropModal'
import { compressCanvas, extForBlob, validateImageFile } from '@/shared/utils/imageCompress'
import { drawCroppedCanvas } from '@/shared/utils/cropImage'
import { xpForLevel } from '@/shared/utils/xp'
import { createClient } from '@/shared/supabase/client'
import { createCrewFromHomeAction } from '@/app/(app)/home/actions'
import { updateCrewImageAction, updateCrewBackgroundImageAction } from '@/app/(app)/chat/actions'

// Figma 426:2044 "home - createASquad" — the canonical Create Squad flow, as a real page
// rather than a bottom sheet. Replaces HomeActionSheet's former 'create' view (see
// HomeClient.tsx) — that view is gone; both ChatRoomBrowseSheet's Create Squad card and
// Home's own menu now route here. Upload/crop pipeline and the
// create_crew → image-upload → /onboarding/class submit flow are unchanged from that
// sheet, just re-skinned onto PageHeader/PageFooter/InputField/Button.
export function CreateSquadPage() {
  const router = useRouter()
  const [squadName, setSquadName] = useState('')

  const [pendingProfilePhoto, setPendingProfilePhoto] = useState<File | null>(null)
  const [profilePhotoBlobs,   setProfilePhotoBlobs]   = useState<{ blob256: Blob; blob128: Blob } | null>(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null)
  const [pendingBackground,   setPendingBackground]   = useState<File | null>(null)
  const [backgroundBlob,      setBackgroundBlob]      = useState<Blob | null>(null)
  const [backgroundPreview,   setBackgroundPreview]   = useState<string | null>(null)
  const [creating,            setCreating]            = useState(false)
  const [createError,         setCreateError]         = useState<string | null>(null)

  const profilePhotoRef = useRef<HTMLInputElement>(null)
  const backgroundRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview)
      if (backgroundPreview)   URL.revokeObjectURL(backgroundPreview)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleProfilePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const validation = validateImageFile(file, 10 * 1024 * 1024) // 10 MB, matches avatar upload
    if (!validation.ok) { setCreateError(validation.error); return }
    setPendingProfilePhoto(file)
  }

  function handleBackgroundChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const validation = validateImageFile(file, 15 * 1024 * 1024) // 15 MB, matches background upload
    if (!validation.ok) { setCreateError(validation.error); return }
    setPendingBackground(file)
  }

  async function handleProfilePhotoCropConfirm(area: Area, img: HTMLImageElement) {
    setPendingProfilePhoto(null)
    const [blob256, blob128] = await Promise.all([
      compressCanvas(drawCroppedCanvas(img, area, 256, 256)),
      compressCanvas(drawCroppedCanvas(img, area, 128, 128)),
    ])
    if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview)
    setProfilePhotoBlobs({ blob256, blob128 })
    setProfilePhotoPreview(URL.createObjectURL(blob256))
  }

  async function handleBackgroundCropConfirm(area: Area, img: HTMLImageElement) {
    setPendingBackground(null)
    const blob = await compressCanvas(drawCroppedCanvas(img, area, 1080, 608))
    if (backgroundPreview) URL.revokeObjectURL(backgroundPreview)
    setBackgroundBlob(blob)
    setBackgroundPreview(URL.createObjectURL(blob))
  }

  async function handleCreate() {
    if (creating || squadName.trim().length < 2) return
    setCreating(true)
    setCreateError(null)
    try {
      const result = await createCrewFromHomeAction(squadName)
      if ('error' in result) { setCreateError(result.error); setCreating(false); return }
      const { crewId } = result
      const supabase   = createClient()

      if (profilePhotoBlobs) {
        try {
          const ts  = Date.now()
          const ext = extForBlob(profilePhotoBlobs.blob256)
          const [res256] = await Promise.all([
            supabase.storage.from('crew-images').upload(`${crewId}/${ts}-256.${ext}`, profilePhotoBlobs.blob256, { contentType: profilePhotoBlobs.blob256.type, cacheControl: '31536000' }),
            supabase.storage.from('crew-images').upload(`${crewId}/${ts}-128.${ext}`, profilePhotoBlobs.blob128, { contentType: profilePhotoBlobs.blob128.type, cacheControl: '31536000' }),
          ])
          if (!res256.error) {
            const { data: { publicUrl } } = supabase.storage.from('crew-images').getPublicUrl(`${crewId}/${ts}-256.${ext}`)
            await updateCrewImageAction(crewId, publicUrl, `${crewId}/${ts}`)
          }
        } catch { /* non-fatal */ }
      }

      if (backgroundBlob) {
        try {
          const ts   = Date.now() + 1
          const ext  = extForBlob(backgroundBlob)
          const path = `${crewId}/bg-${ts}.${ext}`
          const { error: upErr } = await supabase.storage.from('crew-images')
            .upload(path, backgroundBlob, { contentType: backgroundBlob.type, cacheControl: '31536000' })
          if (!upErr) {
            const { data: { publicUrl } } = supabase.storage.from('crew-images').getPublicUrl(path)
            await updateCrewBackgroundImageAction(crewId, publicUrl)
          }
        } catch { /* non-fatal */ }
      }

      router.push(`/onboarding/class?crew=${crewId}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Something went wrong')
      setCreating(false)
    }
  }

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      <PageHeader title="Create a Squad" />

      <div className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col">
        {/* Hero preview (Figma 426:4738 "group_header") — mirrors SquadDetailCard's hero
            shape/tokens (see that file) but can't reuse the component itself: its avatar
            uses next/image with a Supabase-render loader, which can't resolve a local
            blob: preview URL before the crew (and its real storage path) exists yet. */}
        <div
          className="relative w-full flex-shrink-0 overflow-hidden flex flex-col justify-between"
          style={{ height: 240, padding: 16 }}
        >
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
            {backgroundPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={backgroundPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'var(--color-surface)' }} />
            )}
            <div className="absolute inset-0" style={{ background: 'var(--gradient-image-overlay)' }} />
          </div>

          <div className="relative flex items-center flex-1" style={{ gap: 8 }}>
            <div
              className="flex-shrink-0 overflow-hidden flex items-center justify-center"
              style={{ width: 40, height: 40, background: 'var(--color-background)' }}
            >
              {profilePhotoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profilePhotoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                // Same ghost-fallback asset GroupAvatar uses for an image-less crew.
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/icons/ghost-fallback.svg" alt="" style={{ width: '60%', height: '60%', imageRendering: 'pixelated' }} />
              )}
            </div>
            <div className="flex flex-col min-w-0" style={{ gap: 4 }}>
              <p
                className="font-body font-bold leading-none truncate"
                style={{ fontSize: 'var(--md)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
              >
                {squadName || 'Squad Name'}
              </p>
              <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--mini)', color: 'var(--color-secondary)' }}>
                Lv.1 · 1 member
              </p>
            </div>
          </div>

          <div className="relative flex flex-col w-full flex-shrink-0" style={{ gap: 8 }}>
            <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--mini)', color: 'var(--color-tertiary)' }}>
              {`0 / ${xpForLevel(1)}XP`}
              {' · '}
              <span style={{ color: 'var(--color-secondary)' }}>0 total Squad msg.</span>
            </p>
            <div className="bg-[var(--color-surface)] overflow-hidden w-full" style={{ height: 4 }}>
              <div className="h-full bg-purple" style={{ width: '0%' }} />
            </div>
          </div>
        </div>

        {/* Body (Figma 426:2047) */}
        <div className="flex flex-col flex-1" style={{ gap: 'var(--x6)', padding: 16 }}>
          <div className="flex items-center w-full" style={{ gap: 'var(--x5)' }}>
            <div className="flex flex-1 flex-col min-w-0" style={{ gap: 'var(--x2)' }}>
              <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}>
                Profile Photo
              </p>
              <button
                type="button"
                onClick={() => profilePhotoRef.current?.click()}
                className="flex items-center justify-center overflow-hidden w-full"
                style={{ height: 48, gap: 8, border: '1px solid var(--color-purple)' }}
              >
                <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                <span className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--xs)', color: 'var(--color-purple)' }}>
                  Upload
                </span>
              </button>
            </div>
            <div className="flex flex-1 flex-col min-w-0" style={{ gap: 'var(--x2)' }}>
              <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}>
                Background Image
              </p>
              <button
                type="button"
                onClick={() => backgroundRef.current?.click()}
                className="flex items-center justify-center overflow-hidden w-full"
                style={{ height: 48, gap: 8, border: '1px solid var(--color-purple)' }}
              >
                <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                <span className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--xs)', color: 'var(--color-purple)' }}>
                  Upload
                </span>
              </button>
            </div>
          </div>
          <input ref={profilePhotoRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif" onChange={handleProfilePhotoChange} className="hidden" aria-hidden="true" />
          <input ref={backgroundRef}   type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif" onChange={handleBackgroundChange}   className="hidden" aria-hidden="true" />

          <PhotoCropModal
            file={pendingProfilePhoto}
            aspect={1}
            cropShape="rect"
            title="PROFILE PHOTO"
            onCancel={() => setPendingProfilePhoto(null)}
            onConfirm={handleProfilePhotoCropConfirm}
          />
          <PhotoCropModal
            file={pendingBackground}
            aspect={1080 / 608}
            cropShape="rect"
            title="BACKGROUND IMAGE"
            height={220}
            onCancel={() => setPendingBackground(null)}
            onConfirm={handleBackgroundCropConfirm}
          />

          <InputField
            label="Squad Name"
            value={squadName}
            onChange={(v) => setSquadName(v.slice(0, 30))}
            placeholder="Gang Gang"
            helperText="e.g. Coffee Club, The Gathering Spot, Weekend Explorers..."
            required
            autoComplete="off"
          />

          {createError && (
            <p className="font-silkscreen" style={{ fontSize: 'var(--mini)', color: 'var(--red)' }}>
              {createError}
            </p>
          )}
        </div>
      </div>

      <PageFooter>
        <Button shadow disabled={creating || squadName.trim().length < 2} loading={creating} onClick={handleCreate} className="w-full">
          Continue
        </Button>
        <Button variant="outlined" color="red" shadow disabled={creating} onClick={() => router.back()} className="w-full">
          Cancel
        </Button>
      </PageFooter>
    </SlidePage>
  )
}
