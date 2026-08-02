# Cover / Hero Gradient Tokens

Two canonical gradient tokens (`src/app/globals.css`), both built from `--color-background` via `color-mix` so they track the theme's black instead of a hardcoded `rgba(0,0,0,…)`. Never hand-roll an `rgba(0,0,0,…)` gradient for a cover or hero scrim — reuse the matching token.

## `--gradient-image-overlay` — the cover scrim

Light-top → dark-bottom scrim over **every** crew/group and profile background-cover image (Figma 470:5083). Apply as an absolutely-positioned, `pointer-events-none` layer over the image:

```tsx
<div className="relative overflow-hidden">
  {/* background image (next/image fill, or height-anchored <img>) */}
  <div
    className="absolute inset-0 pointer-events-none"
    style={{ background: 'var(--gradient-image-overlay)' }}
  />
  {/* foreground content */}
</div>
```

Full canonical list (all use the token):

- `ChatRoomBrowseSheet` Current Squad Information hero cover (`SquadDetailCard`)
- `SwipePreviewCard` full-bleed cover (ChatRoomBrowseSheet's Groups row cards — bottom-anchored avatar/name/level/count directly over the image, same shape as the hero above)
- `UserCard` background image (member cards in ChatRoomBrowseSheet's Current Squad Information)
- `ManageSquadProfile` hero
- `HomeClient` squad preview + card preview (two spots) + profile preview
- Profile heroes: `ProfileClient`, `MemberProfileClient`, `AccountPageMember`
- `ManageUserProfile` hero (240px)

Any new surface showing a crew/profile cover image uses this token — do not introduce a new gradient.

## `--gradient-hero-top-scrim` — the button-legibility scrim

Dark-top → transparent scrim, a short (~86px) band purely for back/edit **button legibility** on profile heroes. Used by `ProfileClient`, `MemberProfileClient`, and `AccountPageMember`. This is NOT the cover overlay — use this token for the top scrim, `--gradient-image-overlay` for the cover.

## Exceptions — do not "fix" these onto a token

- **Event hero.** `EventPageInfoClient`'s cover keeps its own fade-to-black, intentionally not on `--gradient-image-overlay`.
- **`COVER_FADE_GRADIENT`'s small-card overlay (`shared/components/ui/SwipePreviewCard.tsx`).** A steeper, bottom-heavy fade than `--gradient-image-overlay`'s 20%→80% curve — `color-mix(in srgb, var(--color-background) …, transparent)` at stops 0/20/50/70/80% opacity, positions 0/51/69/80/100%. Originally local to `JoinGroupStep.tsx` as `PAGE_BACKGROUND_GRADIENT`; promoted to a shared export once `CreateSquadPage`'s create-success screen (Figma 784:24784) became a second consumer of the exact same card-overlay curve. Used via `SwipePreviewCard`'s `overlayGradient` override prop on both screens' 210×280 cards.
- **Full-page backdrop scrims behind those same cards are NOT automatically `COVER_FADE_GRADIENT` too — verify each one against Figma independently.** `JoinGroupStep`'s own full-viewport background (Figma 784:5792) reuses `COVER_FADE_GRADIENT` for both the page AND the card — Figma applies the identical curve to both there. `CreateSquadPage`'s create-success page background (Figma 784:24784) does **not**: a fresh pull of that node showed a plain 2-stop fade (`rgba(0,0,0,0.5)` at the top → solid `var(--color-background)` at the bottom), visibly darker at the top than `COVER_FADE_GRADIENT`'s fully-transparent start — kept as `CreateSquadPage.tsx`'s own local `SUCCESS_PAGE_BACKDROP_GRADIENT` (no second consumer yet). The first implementation pass assumed both screens shared one gradient for everything (reasonable given they're structurally near-identical screens) and had to be corrected after re-verifying directly against Figma — don't assume two visually-similar full-bleed-photo screens use the same page-level scrim without checking each one's own node.
- **Not covers.** Purple `linear-gradient(to right, var(--color-purple), #d946ef)` fills are XP/bond progress bars and currency pills; `NotesGrid`/`VinylComboArt`/`SquareAlbumArt` (Vibes) card thumbnails use their own scrims. None are crew/profile covers.
