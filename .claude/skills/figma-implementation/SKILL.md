# Figma UI Implementation

## Purpose

Use this skill when implementing, updating, refactoring, or reviewing UI from a Figma design.

## Objective

Implement the Figma design with high visual fidelity while reusing the existing codebase, components, and design system.

Do not redesign, simplify, or reinterpret the design unless explicitly instructed.

---

## Workflow

Before implementing:

1. Review the Figma file via MCP.
2. Compare the Figma design with the current implementation.
3. Identify visual, structural, and interaction differences.
4. Search the codebase for existing patterns and components.

---

## Codebase First

The existing codebase is the source of truth.

Prefer:

1. Existing component
2. Existing layout
3. Existing hook
4. Existing utility
5. Existing style
6. New implementation only when necessary

Do not duplicate existing functionality.

Extend existing components before creating new ones.

---

## Design System

Always use:

- `global.css` variables
- Design tokens
- Shared typography
- Shared spacing
- Shared colors
- Shared radius
- Shared shadows
- Shared animations

Never hardcode:

- Colors
- Spacing
- Padding
- Margins
- Font sizes
- Border radius
- Shadows
- Animation values

If a required token does not exist, follow existing naming conventions.

---

## Component Reuse

Reuse existing:

- Pages
- Layouts
- Bottom sheets
- Modals
- Forms
- Buttons
- Cards
- Inputs
- Headers
- Navigation
- Hooks
- Utilities

Only create new components when no suitable existing solution exists.

---

## Icons

Use icons in this order:

1. PixelArtIcons library
2. Existing project Figma icons
3. New icon only if neither exists

Do not introduce another icon library.

---

## Figma Accuracy

Match the design precisely:

- Layout
- Padding
- Margins
- Gaps
- Typography
- Font family
- Font size
- Font weight
- Colors
- Sizing
- Alignment
- Positioning
- Borders
- Radius
- Shadows
- Icons
- Component hierarchy

Avoid approximations when values are defined.

---

## Completion Checklist

Before finishing:

- Figma design matches implementation.
- Existing components were reused.
- Styling uses `global.css` variables and tokens.
- No hardcoded design values were introduced.
- No duplicate components were created.
- Responsive behavior is maintained.
- Accessibility is maintained.
