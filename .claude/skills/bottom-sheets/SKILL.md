# Bottom Sheets

## Purpose

Use this skill when creating, modifying, or converting a bottom sheet.

## Component

Always use the shared `BottomSheet` component (`src/shared/components/ui/sheet/BottomSheet.tsx`).

Do not create a custom implementation — hand-rolled `motion.div` sheets drift from the shared drag/dismiss/z-index behavior. Background defaults to `--color-surface-sheet`; don't override it.

---

## CTA Footer

Figma 502:2783 — sheets with pinned CTA buttons (Save/Cancel/Edit/Delete, etc) use the shared `SheetFooter` component (`src/shared/components/ui/sheet/SheetFooter.tsx`), the bottom-sheet counterpart to `PageFooter`. Not every sheet has one — most sheets (toggle rows, pickers, member lists) have no footer at all.

```tsx
<BottomSheet onClose={onClose}>
  <div
    className="flex flex-col"
    style={{
      gap: "var(--space-5)",
      paddingLeft: "var(--x5)",
      paddingRight: "var(--x5)",
    }}
  >
    {/* content — owns its own horizontal padding, no bottom padding when a footer follows */}
  </div>

  <SheetFooter>
    <Button onClick={handleSave} loading={saving} className="w-full">
      Save
    </Button>
    <Button
      variant="outlined"
      color="tertiary"
      onClick={onClose}
      className="w-full"
    >
      Cancel
    </Button>
  </SheetFooter>
</BottomSheet>
```

`SheetFooter` is a sibling **after** the content, not a wrapper around it — same relationship as `PageHeader`/`PageFooter` around a page's scrollable body. It owns `gap: x5`, `padding: pt-x5 px-x5 pb-max(safe-area,x8)`; content sections must own their own horizontal padding. If the footer is conditionally rendered (e.g. creator-only actions), give the content section its own bottom safe-area padding for the no-footer case.

Reuse `Button`/`DefinitionButton` for the CTA itself — `SheetFooter` only owns the container, same rule as `PageFooter`.

**When the content needs to scroll independently of a pinned footer**, don't put `overflow-y-auto` on `BottomSheet` itself (that scrolls the footer along with the content). Instead give the content div its own `flex-1 min-h-0 overflow-y-auto` and let `SheetFooter` stay a `flex-shrink-0` sibling — `BottomSheet`'s outer container is already `flex flex-col`, so this pins the footer while only the content scrolls. (`ChatRoomBrowseSheet`'s Current Squad Information section is NOT this pattern — its Leave Squad button scrolls away with the card/member-row content above it rather than staying pinned, since that overlay has no docked sheet chrome to begin with; see CLAUDE.md's own `ChatRoomBrowseSheet` section. `AnnouncementsSheet` used to be this pattern's example too, but it's no longer a `BottomSheet` at all — it was converted to a full-page overlay; see CLAUDE.md's "Squad Updates" section if you need the fixed-header-over-scrolling-list version of this same idea.)

---

## Variants

Use the existing header variants.

Do not create a new header style unless explicitly requested.

Use the appropriate CTA variant based on the design.

---

## Styling

Reuse the existing:

- Background color
- Radius
- Spacing
- Typography
- Borders
- Design tokens

Never hardcode styling values.

Review the design-system folder SKILL.md for further references.

---

## Behavior

Maintain existing behavior:

- Animation
- Swipe-to-dismiss
- Drag interaction
- Keyboard handling
- Safe area handling
- Scroll behavior

Do not modify these interactions unless requested.

---

## Component Reuse

Reuse existing:

- Header variants
- CTA components
- Footer layouts
- Loading states
- Error states

Extend existing variants before creating new ones.

---

## Validation

Before completing:

- Shared BottomSheet component used
- Existing variant reused
- Existing interactions preserved
- Existing animations preserved
- Design tokens used
- Figma matches implementation
