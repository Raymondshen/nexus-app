# Page Footer

## Purpose

Use this skill when a subpage or full-screen overlay needs one or more CTA buttons pinned to the bottom (e.g. "Save Changes", "Add announcement", "Save definition", "Continue").

Figma 480:6187.

## Component

Always use the shared `PageFooter` component (`src/shared/components/ui/PageFooter.tsx`).

Do not hand-roll a `flex-shrink-0` footer div with inline padding — that duplicates this component and drifts from the Figma spacing over time.

```tsx
<PageFooter>
  <Button shadow onClick={handleSave} loading={saving} className="w-full">
    Save Changes
  </Button>
</PageFooter>
```

Multiple buttons stack with the Figma gap automatically — just pass more than one child. E.g. a Save + Cancel pair (Figma 502:2720 / 502:2723):

```tsx
<PageFooter>
  <Button onClick={handleSave} loading={saving} className="w-full">
    Save Changes
  </Button>
  <Button variant="outlined" color="tertiary" onClick={onCancel} className="w-full">
    Cancel
  </Button>
</PageFooter>
```

Button label text is always a placeholder — swap it for whatever verb fits the page/action ("Save Changes", "Continue", "Add announcement", "Save definition", …). Don't treat any example string in this doc as fixed copy.

---

## Placement

`PageFooter` is NOT `position: fixed`. It docks to the bottom by being a `flex-shrink-0` sibling placed directly AFTER the scrollable content, inside a full-height flex column:

```tsx
<SlidePage className="flex flex-col" style={{ position: 'fixed', inset: 0 }}>
  <PageHeader title="..." />
  <div className="flex-1 min-h-0 overflow-y-auto">
    {/* scrollable content */}
  </div>
  <PageFooter>
    <Button>...</Button>
  </PageFooter>
</SlidePage>
```

This mirrors `PageHeader` (see Page Structure in CLAUDE.md) — header and footer are the fixed top/bottom caps of the page, the middle scrolls.

Never wrap page content in `position: fixed` bottom bar + extra bottom padding on the scroll area to compensate — the flex-sibling approach avoids overlap and keyboard-avoidance issues for free.

---

## Button Reuse

`PageFooter` only owns the container (padding, gap, bottom-safe-area). It does not own button styling. Reuse an existing button component for the CTA itself:

- `Button` (`shadow` prop for the drop-shadow CTA variant) — most subpage "Save" actions
  - `variant="filled"` (default): purple bg
  - `variant="outlined" color="purple"` (default) / `"red"` / `"tertiary"`: transparent bg, colored border + text — Figma 502:2788 / 502:2789 / 502:2723
- `DefinitionButton` — definitions flow only

Do not create a new button component for a subpage CTA before checking whether `Button` or `DefinitionButton` already covers the variant. Extend the existing one before creating a new one, same rule as the design-system skill.

---

## Validation

Before completing:

- Shared `PageFooter` component used, not an inline `flex-shrink-0` div
- `PageFooter` is a flex sibling after the scrollable content, not `position: fixed`
- Existing `Button`/`DefinitionButton` reused for the CTA, not a new one-off button
- Design tokens used (no hardcoded padding/gap values)
- Figma matches implementation
