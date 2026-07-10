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

- `SquadDetailsSheet` group header cover
- `UserCard` background image (member cards in SquadDetailsSheet)
- `ManageSquadProfile` hero
- `HomeClient` squad preview + card preview (two spots) + profile preview
- Profile heroes: `ProfileClient`, `MemberProfileClient`, `AccountPageMember`
- `ManageUserProfile` hero (240px)

Any new surface showing a crew/profile cover image uses this token — do not introduce a new gradient.

## `--gradient-hero-top-scrim` — the button-legibility scrim

Dark-top → transparent scrim, a short (~86px) band purely for back/edit **button legibility** on profile heroes. Used by `ProfileClient`, `MemberProfileClient`, and `AccountPageMember`. This is NOT the cover overlay — use this token for the top scrim, `--gradient-image-overlay` for the cover.

## Exceptions — do not "fix" these onto a token

- **Event hero.** `EventPageInfoClient`'s cover keeps its own fade-to-black, intentionally not on `--gradient-image-overlay`.
- **Not covers.** Purple `linear-gradient(to right, var(--color-purple), #d946ef)` fills are XP/bond progress bars and currency pills; `NotesGrid`/`VibesGrid` card thumbnails use their own scrims. None are crew/profile covers.
