---
name: design-system
description: Nexus design-system rules — always use design tokens (never hardcode colors/spacing/typography/sizing), reuse existing components before creating new ones, and use the single canonical --gradient-image-overlay scrim for every crew/profile cover image. Load before styling any surface, adding a cover/hero image overlay, or introducing a color/spacing/gradient value.
---

# Design System

## The rules

1. **Always use design tokens.** Never hardcode colors, spacing, typography, or sizing values. Tokens live in `src/app/globals.css`; the catalog (color tokens, `--xN` spacing scale, `font-pixel`/`font-body`/`font-silkscreen`, icon usages) is in CLAUDE.md → **Design Tokens**.
2. **Reuse existing components before creating new ones.** Prefer `UserAvatar`, `GroupAvatar`, `InputField`/`TextareaField`, `BottomSheet`, `SheetActionButton`, `DefinitionButton`, `VinylPill`, `InviteCodeCard`, etc. over re-inlining markup. Check `src/shared/components/ui/` first.
3. **Figma variables are the source of truth** for design decisions. When code and Figma disagree, fix code to match Figma (and note real mismatches, e.g. the toggle off-track that was `--color-border` in code but `--color-muted` in Figma).

## Cover / hero image overlay — one canonical token

`--gradient-image-overlay` (`globals.css`) is the **single scrim for every crew/group and profile background-cover image** — a light-top → dark-bottom gradient (Figma 470:5083) built from `--color-background` via `color-mix`, so it tracks the theme's black instead of a hardcoded `rgba(0,0,0,…)`.

**Always reuse this token for a cover overlay. Never hand-roll an `rgba(0,0,0,…)` gradient for one.** Apply it as an absolutely-positioned, `pointer-events-none` layer over the image:

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

### The full canonical list (all use the token)

- `SquadDetailsSheet` group header cover
- `UserCard` background image (member cards in SquadDetailsSheet)
- `ManageSquadProfile` hero
- `HomeClient` squad preview + card preview (two spots) + profile preview
- Profile heroes: `ProfileClient`, `MemberProfileClient`, `AccountPageMember`
- `ManageUserProfile` hero (240px)

If you add any new surface that shows a crew or profile cover image, use this token — do not introduce a new gradient.

### Two documented exceptions — do not "fix" these onto the token

1. **Profile-hero top scrim.** `ProfileClient`, `MemberProfileClient`, and `AccountPageMember` *also* keep a separate short (~86px) top scrim purely for back/edit **button legibility**. That is NOT the cover overlay — it is its own token, `--gradient-hero-top-scrim` (dark-top → transparent, also built from `--color-background`). Use that token for the top scrim, the cover token for the cover.
2. **Event hero.** `EventPageInfoClient`'s cover keeps its own fade-to-black and is intentionally not on this token.

### Not covers (leave as-is)

Purple `linear-gradient(to right, var(--color-purple), #d946ef)` fills are XP/bond progress bars and currency pills. Note/Vibe card thumbnails (`NotesGrid`, `VibesGrid`) use their own scrims by design. None of these are crew/profile covers — the token does not apply.
