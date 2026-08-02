'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Area } from 'react-easy-crop'
import { Plus } from 'pixelarticons/react/Plus'
import { SlidePage } from '@/app/layouts/SlidePage'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { PageFooter } from '@/shared/components/ui/PageFooter'
import { InputField } from '@/shared/components/ui/InputField'
import { Button } from '@/shared/components/ui/Button'
import { PhotoCropModal } from '@/shared/components/ui/PhotoCropModal'
import { ProfileHeroBackground } from '@/shared/components/ui/ProfileHeroBackground'
import { SwipePreviewCard, COVER_FADE_GRADIENT } from '@/shared/components/ui/SwipePreviewCard'
import { InviteCodeCard } from '@/shared/components/ui/InviteCodeCard'
import { compressCanvas, extForBlob, validateImageFile } from '@/shared/utils/imageCompress'
import { drawCroppedCanvas } from '@/shared/utils/cropImage'
import { createClient } from '@/shared/supabase/client'
import { createCrewFromHomeAction } from '@/app/(app)/home/actions'
import { updateCrewImageAction, updateCrewBackgroundImageAction } from '@/app/(app)/chat/actions'
import type { RoomMeta } from '@/features/chat/store/chatRoomPeekStore'

// Figma 784:24784's own full-page backdrop fade — deliberately NOT the same
// curve as COVER_FADE_GRADIENT (that one's for the small preview card's own
// overlay, re-verified against this node and still correct there). Re-pulled
// this node directly and confirmed the page-level scrim here is a plain
// 2-stop fade, darker at the top than COVER_FADE_GRADIENT's fully-transparent
// start: rgba(0,0,0,0.5) -> solid black. Local to this screen for now — no
// second consumer yet, so not promoted to a shared export.
const SUCCESS_PAGE_BACKDROP_GRADIENT = 'linear-gradient(180deg, color-mix(in srgb, var(--color-background) 50%, transparent) 0%, var(--color-background) 100%)'

// Figma 784:24486 "chatroom - create empty" — the canonical Create Squad flow, as a real
// page rather than a bottom sheet. Replaces HomeActionSheet's former 'create' view (see
// HomeClient.tsx) — that view is gone; ChatRoomBrowseSheet's Create Squad card,
// ChatroomEmptyScreen's Create a Group button, and Home's own menu all route here.
// Upload/crop pipeline unchanged; the create_crew round trip now finishes on this same
// page's own success view (784:24784, see below) instead of redirecting straight to
// /onboarding/class.
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

  // Set once create_crew (+ any image uploads) finishes — swaps this page's own
  // content over to the success view (Figma 784:24784) rather than navigating
  // away, since every field this view needs (the crew's own name/photos/invite
  // code) already lives in this component's state/closures right after
  // handleCreate finishes. Navigating to a separate route instead would have
  // meant either re-fetching the crew or trying to carry local blob: preview
  // URLs across a navigation — those get revoked by this component's own
  // unmount cleanup below.
  const [success, setSuccess] = useState<{ room: RoomMeta & { id: string }; inviteCode: string; uploadWarning: string | null } | null>(null)

  const profilePhotoRef = useRef<HTMLInputElement>(null)
  const backgroundRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview)
      if (backgroundPreview)   URL.revokeObjectURL(backgroundPreview)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Plain <input type="file" accept="image/*"> with no `capture` attribute —
  // deliberately not narrowed to `capture="environment"` (which would force
  // the camera and hide the gallery entirely). Left as-is, this already
  // surfaces exactly "Take Photo" / "Photo Library" (iOS Safari) or
  // "Camera" / "Files" (Android Chrome) via the native OS picker, with no
  // custom in-app source-selection sheet layered on top — matching the
  // dashed-border + centered Plus trigger CreateProfileStep's Setup Profile
  // screen uses for the exact same two-source constraint.
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
      const { crewId, inviteCode } = result
      const supabase   = createClient()

      // Real storage public URLs (not the local blob: previews above, which
      // get revoked on unmount) — captured for the success view's card.
      // The two uploads below are independent (different storage paths,
      // different DB rows) and each already self-contained in its own
      // try/catch, so they run concurrently rather than one after the other —
      // the success view can't render until both settle, so this halves the
      // wait when a caller picks both a photo and a background. A failure
      // here is still non-fatal to crew creation (the crew already exists),
      // but — unlike before — it's no longer swallowed silently: `failed`
      // feeds the success screen's warning banner below, since a caller who
      // picked a photo and lands on a success screen with no photo deserves
      // to know why, not just quietly get a ghost-fallback icon.
      const [photoResult, backgroundResult] = await Promise.all([
        (async (): Promise<{ url: string | null; failed: boolean }> => {
          if (!profilePhotoBlobs) return { url: null, failed: false }
          try {
            const ts  = Date.now()
            const ext = extForBlob(profilePhotoBlobs.blob256)
            const [res256] = await Promise.all([
              supabase.storage.from('crew-images').upload(`${crewId}/${ts}-256.${ext}`, profilePhotoBlobs.blob256, { contentType: profilePhotoBlobs.blob256.type, cacheControl: '31536000' }),
              supabase.storage.from('crew-images').upload(`${crewId}/${ts}-128.${ext}`, profilePhotoBlobs.blob128, { contentType: profilePhotoBlobs.blob128.type, cacheControl: '31536000' }),
            ])
            if (res256.error) return { url: null, failed: true }
            const { data: { publicUrl } } = supabase.storage.from('crew-images').getPublicUrl(`${crewId}/${ts}-256.${ext}`)
            await updateCrewImageAction(crewId, publicUrl, `${crewId}/${ts}`)
            return { url: publicUrl, failed: false }
          } catch { return { url: null, failed: true } }
        })(),
        (async (): Promise<{ url: string | null; failed: boolean }> => {
          if (!backgroundBlob) return { url: null, failed: false }
          try {
            const ts   = Date.now() + 1
            const ext  = extForBlob(backgroundBlob)
            const path = `${crewId}/bg-${ts}.${ext}`
            const { error: upErr } = await supabase.storage.from('crew-images')
              .upload(path, backgroundBlob, { contentType: backgroundBlob.type, cacheControl: '31536000' })
            if (upErr) return { url: null, failed: true }
            const { data: { publicUrl } } = supabase.storage.from('crew-images').getPublicUrl(path)
            await updateCrewBackgroundImageAction(crewId, publicUrl)
            return { url: publicUrl, failed: false }
          } catch { return { url: null, failed: true } }
        })(),
      ])

      const failedUploads: string[] = []
      if (photoResult.failed)      failedUploads.push('group photo')
      if (backgroundResult.failed) failedUploads.push('background image')

      setSuccess({
        room: {
          id:                  crewId,
          name:                squadName.trim(),
          imageUrl:            photoResult.url,
          backgroundImageUrl:  backgroundResult.url,
          level:               1,
          memberCount:         1,
          lastMessagePreview:  null,
          lastMessageAt:       null,
          unreadCount:         0,
          onlineMembers:       [],
        },
        inviteCode,
        uploadWarning: failedUploads.length > 0
          ? `Group created, but the ${failedUploads.join(' and ')} failed to upload. You can add ${failedUploads.length > 1 ? 'them' : 'it'} later from Manage Squad.`
          : null,
      })
      setCreating(false)
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
      {success ? (
        // Figma 784:24784 "chatroom - create success" — no PageHeader/back
        // button (matches the design: once the crew exists, there's nothing
        // to "cancel" back out of). Reuses ProfileHeroBackground/SwipePreviewCard
        // the same way JoinGroupStep's own "Invite Success" state does, but the
        // page-level scrim here is its own gradient (SUCCESS_PAGE_BACKDROP_GRADIENT
        // above) — distinct from the card's own COVER_FADE_GRADIENT overlay below.
        <div className="relative flex-1 w-full flex flex-col items-center overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <ProfileHeroBackground url={success.room.backgroundImageUrl} />
            <div className="absolute inset-0" style={{ backgroundImage: SUCCESS_PAGE_BACKDROP_GRADIENT }} />
          </div>

          <div
            className="relative flex-1 w-full flex flex-col items-center justify-between min-h-0"
            style={{
              paddingTop:    'max(env(safe-area-inset-top), var(--x5))',
              paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
              paddingLeft:   'var(--x5)',
              paddingRight:  'var(--x5)',
            }}
          >
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">
              <SwipePreviewCard
                room={success.room}
                width={210}
                height={280}
                border="1px solid var(--color-border-hover)"
                overlayGradient={COVER_FADE_GRADIENT}
              />
            </div>

            <div className="flex flex-col w-full flex-shrink-0" style={{ gap: 'var(--x6)' }}>
              {success.uploadWarning && (
                <p
                  className="font-body font-normal leading-relaxed text-center w-full"
                  style={{ fontSize: 'var(--xs)', color: 'var(--yellow)', fontVariationSettings: '"opsz" 14' }}
                >
                  {success.uploadWarning}
                </p>
              )}
              <InviteCodeCard inviteCode={success.inviteCode} groupName={success.room.name} variant="success" />
              <Button
                type="button"
                variant="filled"
                color="primary"
                rounded
                labelFont="body"
                className="w-full"
                onClick={() => router.push(`/chat/${success.room.id}`)}
              >
                Start Chatting
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <PageHeader variant="auth" title="Create a Group" />

          <div className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col">
            {/* Hero preview (Figma 784:24564 "group detail section") — empty-state
                placeholder until a name/photo exists: solid surface fill (no image,
                no scrim), a blank dashed 40x40 box standing in for the group photo,
                and muted uppercase "GROUP NAME" text. No XP/message-count row here
                (unlike the old design) — there's no real crew yet to report stats
                for; that readout only ever made sense once one actually existed. */}
            <div
              className="relative w-full flex-shrink-0 overflow-hidden flex flex-col justify-end"
              style={{ height: 240, padding: 16, background: 'var(--color-surface)' }}
            >
              {backgroundPreview && (
                <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={backgroundPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div className="absolute inset-0" style={{ background: 'var(--gradient-image-overlay)' }} />
                </div>
              )}

              <div className="relative flex items-center" style={{ gap: 8, height: 40 }}>
                {profilePhotoPreview ? (
                  <div className="flex-shrink-0 overflow-hidden" style={{ width: 40, height: 40, background: 'var(--color-background)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={profilePhotoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div className="flex-shrink-0" style={{ width: 40, height: 40, border: '1px dashed var(--color-muted)' }} aria-hidden="true" />
                )}
                <p
                  className="font-body font-bold leading-none truncate uppercase"
                  style={{
                    fontSize: 16,
                    color: squadName ? 'var(--color-secondary)' : 'var(--color-muted)',
                    fontVariationSettings: '"opsz" 14',
                  }}
                >
                  {squadName || 'Group Name'}
                </p>
              </div>
            </div>

            {/* Body (Figma 784:24504) */}
            <div className="flex flex-col flex-1" style={{ gap: 'var(--x6)', padding: 16 }}>
              <div className="flex items-center w-full" style={{ gap: 'var(--x5)' }}>
                <div className="flex flex-col flex-shrink-0" style={{ gap: 8 }}>
                  <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}>
                    Group Photo
                  </p>
                  <button
                    type="button"
                    onClick={() => profilePhotoRef.current?.click()}
                    className="flex items-center justify-center border border-dashed border-border-hover overflow-hidden appearance-none active:opacity-70 transition-opacity"
                    style={{ width: 112, height: 112 }}
                    aria-label="Upload group photo"
                  >
                    <Plus style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
                  </button>
                </div>

                <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
                  <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}>
                    Background Image
                  </p>
                  <button
                    type="button"
                    onClick={() => backgroundRef.current?.click()}
                    className="flex items-center justify-center w-full border border-dashed border-border-hover overflow-hidden appearance-none active:opacity-70 transition-opacity"
                    style={{ height: 112 }}
                    aria-label="Upload background image"
                  >
                    <Plus style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <input ref={profilePhotoRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif" onChange={handleProfilePhotoChange} className="hidden" aria-hidden="true" />
              <input ref={backgroundRef}   type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif" onChange={handleBackgroundChange}   className="hidden" aria-hidden="true" />

              <PhotoCropModal
                file={pendingProfilePhoto}
                aspect={1}
                cropShape="rect"
                title="GROUP PHOTO"
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
                label="Group Name"
                value={squadName}
                onChange={(v) => setSquadName(v.slice(0, 30))}
                placeholder="e.g. Coffee Club"
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
            <Button
              type="button"
              variant="filled"
              rounded
              labelFont="body"
              loading={creating}
              disabled={creating || squadName.trim().length < 2}
              className="w-full"
              onClick={handleCreate}
            >
              Create Group
            </Button>
          </PageFooter>
        </>
      )}
    </SlidePage>
  )
}
