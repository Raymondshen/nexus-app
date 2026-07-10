# Design System

## Purpose

Use this skill when creating, modifying, or reviewing UI.

Applies to:

- New pages
- Components
- Figma implementations
- UI refactors
- Styling changes

---

## Source of Truth

Follow this priority:

1. Existing project components
2. `src/app/globals.css`
3. Figma variables/tokens
4. Design system references

---

## Rules

Always:

- Use existing components before creating new ones.
- Use design tokens instead of hardcoded values.
- Match existing UI patterns.
- Follow Figma specifications when provided.

Never:

- Introduce arbitrary styling values.
- Duplicate existing components.
- Create new UI patterns without need.

---

## References

Use these files for detailed rules:

- `colors.md` → color tokens
- `spacing.md` → spacing or sizing scale
- `typography.md` → fonts and text styles
- `icon-usage.md` → icon selection and usage
