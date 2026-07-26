# Typography

Use typography tokens.

font-body:
DM Sans

font-silkscreen:
Silkscreen
- heading: Figma named style "heading" — Silkscreen Regular, md (16px). Short in-line
  Silkscreen headings (distinct from page-title usage, which runs larger — xl/xxl).
  Code: `font-silkscreen text-[length:var(--text-md)]`. No current use — the swipe-nav
  transition splash's room-name row (ChatRoomPeekLayer.tsx) used to be the reference
  example here, then briefly moved to DM Sans Bold md/16px, before the current Figma
  revision (node 659:9526) moved it again to DM Sans Black (font-black/900) at display
  size (32px, `--text-display`), uppercase, 0.64px tracking — see the `font-body` black
  usage in ChatRoomPeekLayer.tsx's `PeekGhost`.

Headings / Titles:
- Display
- XXL
- xl
- lg

Body:
- md
- sm
- xs

Caption/HelperText:
- xxs
- mini