---
name: image-handling
description: Reference for how images are stored, uploaded, cropped, compressed, and served in Nexus — static assets under public/, the Supabase image-render loaders, and the two upload/compression pipelines (the shared crop+compress engine used by all 8 profile/crew/event photo surfaces, vs. the separate chat-image engine). Load when touching image upload, cropping, compression, avatars, crew images, or anything under public/.
---

# Image Handling

## Static assets (`public/`)
- `sprites/{class}/{direction}.png` — 28×28 pixel art. 7 classes (archer, ghost, healer, mage, necromancer, rogue, warrior) × 8 directions (north, north-east, east, south-east, south, south-west, west, north-west). Rendered via `PixelSprite`.
- `sprites/ghost/south-flip.gif` — 48×48, used by `MessageList`'s `EmptyState` ghost animation.
- `icons/icon-192.png` / `icon-512.png` — PWA manifest icons. `icons/ghost-fallback.svg` — `GroupAvatar`'s no-image fallback. `icons/leave-pixel.svg`.
- `img/default_image.png` (1462×1076) — fallback for `profiles.background_url` / crew member card background. `img/eventDefaultImage.png` (1536×1024) — event cover fallback. `img/announcements/*.svg` — announcement banner images.
- `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` — standard browser/iOS icons.
- `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` (public root) — unreferenced create-next-app scaffold leftovers (verified: no hits under `src/`). Not causing harm; safe to delete in a cleanup pass but out of scope otherwise.

## Runtime image loaders (`src/shared/supabase/imageLoader.ts`)
- `supabaseImageLoader({ src, width, quality })` — standard `next/image` loader. Rewrites `/storage/v1/object/public/` → `/storage/v1/render/image/public/`, sets `width` + `quality` (default 75). No-ops for non-Supabase URLs.
- `avatarImageLoader({ src, width, quality })` — forces a square crop: for Supabase storage sets both `width` and `height` to the same value; for `googleusercontent.com` URLs rewrites the `=sNNN` suffix to `=s{width}-c`; other URLs pass through unchanged. Used by `UserAvatar` and `VinylPill`'s 12×12 disc (both squares, `fill` + `object-cover`). A custom `loader` prop bypasses `next/image`'s `images.remotePatterns` domain check entirely (that validation lives inside `defaultLoader` only), so `VinylPill` can safely route arbitrary external OG-thumbnail hosts through it — the pass-through branch just returns the URL unchanged, identical to the plain `<img>` it replaced.
- Other external-URL surfaces (e.g. `NotesGrid`'s OG thumbnails) still render via plain `<img>`, not `next/image` — no forced-square framing needed there, so there's nothing for a custom loader to add.

## Shared display components — never inline `avatarImageLoader`/`supabaseImageLoader` directly
- `<UserAvatar>` — every person avatar.
- `<GroupAvatar>` — every crew/squad image.
- `<ProfileHeroBackground>` — full-bleed `profiles.background_url` hero (resizes to 480w via `supabaseImageLoader` before rendering as a plain `<img>`). `UserCard`'s member-card background and `ManageUserProfile`'s hero preview use the same plain-`<img>` inline pattern (not this shared component, since their container dimensions/gradient differ) — all three render the same `background_url`, cropped to 16:9 at upload time (`BackgroundUploadModal`'s fixed pan/zoom frame).
  - **`ManageUserProfile`'s hero (240px tall, ~1.6:1) is the reference framing** — closest of the three to the source's 16:9, so it's the only one still on `object-fit: cover`. `UserCard` (180×108, ~1.67:1) and `ProfileHeroBackground` (used by `ProfileClient`/`MemberProfileClient`/`AccountPageMember`, `280px + safe-area-inset-top` tall, ~1.15–1.26:1 on a notched phone) both switched from `cover` to **`object-fit: fill`**. `ProfileHeroBackground`'s container is genuinely far off 16:9, so `cover` there was cropping away most of the photo's width. `UserCard`'s own aspect ratio (~1.67:1) is close enough to 16:9 that the *math* says `cover` should barely crop it — verified this in isolation with a stock photo and it held up — but on the actual uploaded photo, that small residual crop was enough to push a specific design element (a background-image detail sitting near the frame edge) out of view entirely, which read as "way too zoomed in" even though the crop percentage was tiny. Lesson: a small aspect-ratio mismatch can still meaningfully change what's visible depending on where the photo's content sits, so don't assume "close enough" ratios are safe from this — `fill` (zero crop, full width always in frame, mild vertical stretch to fill the box) is the safer default for any surface rendering `background_url` unless the surface's aspect ratio is *exactly* 16:9. If a new hero surface needs this image, default to `fill` rather than re-deriving "is my ratio close enough" per surface.

## Upload + compression — two pipelines, one shared engine for pipeline 1

### 1. Profile/crew photos — every crop-based upload surface
All 8 call sites share the same engine module (`src/shared/utils/imageCompress.ts`) for validation, compression, and extension/content-type resolution — none of them re-derive these locally:

| Surface | Component | Variants |
|---|---|---|
| Avatar | `AvatarUploadModal` | 128px + 256px, + server-side AVIF |
| Profile background | `BackgroundUploadModal` | 1 (progressive canvas sizes) |
| Crew image | `CrewImageUploadModal` | 128px + 256px |
| Crew background | `CrewBackgroundUploadModal` | 1 (progressive canvas sizes) |
| Profile photo gallery | `PhotosGrid` | 1 (800×800) |
| Crew-creation profile photo | `HomeClient` (`handleProfilePhotoCropConfirm`) | 128px + 256px |
| Crew-creation background | `HomeClient` (`handleBackgroundCropConfirm`) | 1 (1080×608) |
| Event cover | `EventCreationSheet` (`handleCoverCropConfirm`) | 1 (1200×900) |

Flow: file picker → `PhotoCropModal` or a bespoke modal (`ZoomPanCropper`, `react-easy-crop` fixed-frame pan/zoom — frame stays put, user pans/zooms the photo) → `drawCroppedCanvas()` (`src/shared/utils/cropImage.ts`) → `compressCanvas()` (`src/shared/utils/imageCompress.ts`) → Supabase Storage upload → server action DB write.

- **Validation** — every surface calls `validateImageFile(file, maxBytes)` (`imageCompress.ts`) before opening the cropper: checks against the shared `ACCEPTED_IMAGE_TYPES` set (jpeg/png/webp/heic/heif) and a per-surface byte cap (10MB avatar/crew-image-style, 15MB background/gallery/event-cover-style). Don't inline a local MIME `Set` or size check in a new upload surface — import `validateImageFile`.
- **Compression** — `compressCanvas`: hard **200KB** target (`MAX_OUT_BYTES`). WebP quality ladder `[0.85, 0.70, 0.55, 0.40, 0.25, 0.10]`, stop at first ≤200KB. If `canvas.toBlob` returns `null` for WebP (Safari can't encode it), falls back to JPEG ladder `[0.90, 0.75, 0.60, 0.45, 0.30]`. If nothing fits, returns smallest found; last resort is lossless PNG.
- **Extension/content-type** — always call `extForBlob(blob)` (`imageCompress.ts`) and use the blob's own `.type` as `contentType` — never hardcode `'webp'`/`'image/webp'`. `compressCanvas` can silently return JPEG or PNG depending on browser support, and a hardcoded extension will upload e.g. real JPEG bytes under a `.webp` key with an `image/webp` content-type (mismatched, broken on decode). This was an actual bug in `HomeClient`'s two crew-creation upload calls and `EventCreationSheet`'s cover upload until it was fixed — always route through `extForBlob`, don't re-derive the ternary locally.
- Avatar + crew image: two variants generated in parallel (128px + 256px). Avatar additionally triggers the `process-avatar` edge function, which downloads the 256px WebP and uses `sharp` server-side to produce AVIF variants at 64/128/256px (quality 65/65/70) — 512px is deliberately omitted (would upscale from the 256px source with no quality gain).
- `profiles.custom_avatar = true` is set on any manual avatar upload and blocks Google OAuth from overwriting it with the account's Google profile photo on subsequent sign-ins.
- Background-style surfaces (16:9 hero, and crew background): single variant, but tries progressively smaller canvas sizes — `1080×608 → 800×450 → 540×304` — re-running `compressCanvas` at each until one hits 200KB.
- Event cover and crew-creation pickers use a single `compressCanvas` call at their target size (no progressive shrink, no dual-variant) — acceptable since they're lower-traffic/one-shot surfaces, but keep in mind they have no 200KB fallback ladder beyond what `compressCanvas` itself does at that one size.

### 2. Chat message images (`ChatInput.handleChatImagesPick`)
No cropping — resize + recompress at the original aspect ratio.

- `validateImageUpload()` (`src/shared/utils/imageProcessing.ts`): MIME check (includes GIF) + size limit (15MB normal, 5MB GIF).
- `generateLQIP()` (20px-wide blurred JPEG placeholder, quality 0.5, base64 → `messages.image_blur_hash`) and `compressImage()` run in parallel.
- `compressImage()`: scales so the longest edge ≤ 1200px (`IMAGE_CONFIG.CHAT_IMAGE_MAX_WIDTH_PX`, never upscales), draws to canvas (strips EXIF as a side effect), encodes WebP at a **network-adaptive quality** — base `0.80` × scale from `navigator.connection.effectiveType` (1.0 fast/4g, 0.85 medium/3g, 0.7 slow), JPEG fallback if WebP encoding unsupported. GIFs pass through untouched (canvas would flatten animation).
- Up to 4 images uploaded in parallel to the `chat-images` bucket; each tile has independent optimistic-preview/uploading/error state.
- No fixed byte-size cap here (unlike `compressCanvas`'s 200KB target) — single quality pass based on network speed.

## Aspect ratios by surface
avatar 1:1 round · profile cover 1080:608 (16:9) · group photo 1:1 rect · group cover 1080:608 · profile gallery photo 1:1 · crew-creation photo/background 1:1 / 1080:608 · event cover 4:3 (matches `EventCard`'s display aspect)

## Key files
- `src/shared/utils/cropImage.ts` — `loadImageEl`, `drawCroppedCanvas`
- `src/shared/utils/imageCompress.ts` — the shared engine for every crop-based surface: `compressCanvas`, `MAX_OUT_BYTES`, `ACCEPTED_IMAGE_TYPES`, `validateImageFile`, `extForBlob`
- `src/shared/utils/imageProcessing.ts` — the separate chat-image engine: `compressImage`, `generateLQIP`, `validateImageUpload`, `getNetworkQuality`
- `src/shared/components/ui/ZoomPanCropper.tsx` — the `react-easy-crop` widget
- `src/shared/components/ui/PhotoCropModal.tsx` — generic crop bottom-sheet (no upload/DB logic of its own)
- `src/shared/supabase/imageLoader.ts` — `supabaseImageLoader`, `avatarImageLoader`
- `supabase/functions/process-avatar/index.ts` — `sharp`-based AVIF generation, deployed with `--no-verify-jwt`

## Gotchas
- `resizeImageToBlob` (a blind center-crop compressor) was removed from `imageCompress.ts` once its last caller migrated to the crop-first flow. `compressCanvas` and `compressImage` are the only two compression paths in the app — don't add a third without a real reason.
- Drawing to canvas strips EXIF automatically; no separate strip step is needed anywhere in either pipeline.
- `PhotoCropModal.onConfirm` hands back an already-loaded `HTMLImageElement`, not a src string — the caller may close the modal (revoking the underlying blob URL) synchronously inside its own confirm handler, and a fully-decoded `<img>` keeps its bitmap drawable via canvas even after `src` is revoked. Don't change this to pass a string back.
- Every single-photo upload surface must use the fixed-frame pan/zoom cropper (`ZoomPanCropper`/`PhotoCropModal`) — never a movable/resizable selection-box cropper.
- **Never re-declare `ACCEPTED_IMAGE_TYPES`, the ext-from-blob-type ternary, or a hardcoded `'webp'` extension/content-type locally in a new upload surface.** Import `validateImageFile` + `extForBlob` from `imageCompress.ts` instead — this is what keeps every crop-based surface on the same engine. Three call sites (`HomeClient`'s two crew-creation uploads, `EventCreationSheet`'s cover upload) drifted from this before being consolidated: they skipped input validation entirely and hardcoded `.webp`/`image/webp` regardless of what `compressCanvas` actually returned, which silently corrupts the file on any browser that falls back to JPEG/PNG (Safari).
- Chat images (`imageProcessing.ts`) are a deliberately separate second engine, not an inconsistency to fix — they need network-adaptive quality, no forced crop, and GIF passthrough, none of which fit `compressCanvas`'s crop+200KB-cap model. If asked to "unify" image handling, unify duplication *within* the crop pipeline (done) rather than merging the two engines, unless the product behavior change (losing GIF support / adaptive quality / adding a forced crop to chat photos) is explicitly wanted.
