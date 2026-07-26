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
  example here, but a later Figma revision (node 659:9526) moved that row to
  `app/title` (DM Sans Bold, md/16px) instead — see the `font-body` bold usage below.

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