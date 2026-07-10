---
name: page-implementation
description: The standard three-part layout for Nexus subpages (a full page the user navigates to, e.g. Definitions, Developer Settings, Create Squad) — PageHeader on top, a scrollable body in the middle, an optional pinned-bottom CTA button at the bottom, built with flexbox rather than literal position:fixed. Load before building any new subpage, or when auditing an existing subpage's header/scroll/footer structure.
---

# Page Implementation

## The three-part structure

Every subpage (a full page navigated to via router push/`SlidePage`, as opposed to a `BottomSheet` or overlay) follows the same vertical layout:

1. **Header** — `<PageHeader>` (`src/shared/components/ui/PageHeader.tsx`) at the very top, `flex-shrink-0`.
2. **Body** — a single `flex-1 min-h-0 overflow-y-auto` container between header and footer. This is the only scrollable region on the page.
3. **Footer** — an optional `flex-shrink-0` CTA button container pinned to the bottom (see "Pages without a natural CTA" below).

## Why this isn't literal `position: fixed`

The footer is visually "pinned to the bottom," but it's built with **flexbox, not CSS `position: fixed`** on the button itself. The outer page wrapper is `position: fixed; inset: 0` (via `<SlidePage>`), and its children lay out as a `flex flex-col` column: header `flex-shrink-0`, body `flex-1 min-h-0 overflow-y-auto`, footer `flex-shrink-0`. This produces the same pinned-to-bottom result as literal `position: fixed` while keeping the footer in normal document flow — which sidesteps the usual mobile problems with a truly fixed-position footer (iOS keyboard pushing it around, safe-area insets, scroll-restoration quirks). Copy this pattern; don't put `position: fixed` on the footer element itself.

## Canonical skeleton

```tsx
'use client'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { Button } from '@/shared/components/ui/Button'

export function SomeSubpage(/* props */) {
  const goBack = useSlideBack()

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      <PageHeader title="SOME PAGE" onBack={goBack} />

      <div className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col" style={{ gap: 20, padding: 16 }}>
        {/* page content */}
      </div>

      <div
        className="flex-shrink-0"
        style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
      >
        <Button shadow onClick={handleSubmit} className="w-full">
          CTA Label
        </Button>
      </div>
    </SlidePage>
  )
}
```

`PageHeader` takes `title`, `onBack`, and an optional `right` node (e.g. `DefinitionHomePage`'s `Plus` add-button). Use `right` instead of adding a second header row.

## Pages without a natural CTA

Not every subpage has a single submit action — a pure settings/list page (e.g. `DeveloperUserSettings.tsx`) has nothing to commit. In that case, omit the footer entirely; the header + scrollable-body two-part structure still applies. Don't invent a filler button just to force the three-part shape.

## Existing subpages that predate `PageHeader`

`ManageUserProfile.tsx` and `DeveloperUserSettings.tsx` each still define their own local bare-icon header component instead of importing `PageHeader` — they predate its extraction out of `DefinitionHomePage.tsx`. This isn't a live bug, but:
- Any **new** subpage must use `PageHeader` directly, not a bespoke local header component.
- If you're already touching one of these older pages for an unrelated reason, migrating its header to `PageHeader` is a reasonable drive-by — don't do it as a standalone bulk refactor across unrelated files.

## Key files
- `src/shared/components/ui/PageHeader.tsx` — the shared header (title + back button + optional right-side node)
- `src/features/chat/screens/DefinitionHomePage.tsx` — reference: list page header + full-screen create/edit overlay header, both via `PageHeader`
- `src/features/profile/screens/ManageUserProfile.tsx` — reference: scrollable body + pinned-footer `Save Changes` CTA (header here predates `PageHeader`, see above)
- `src/app/layouts/SlidePage.tsx` — the `position: fixed; inset: 0` outer wrapper + `useSlideBack()`
