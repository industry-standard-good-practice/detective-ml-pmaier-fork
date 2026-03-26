---
name: swe-ui-practices
description: >-
  Guides component reuse hierarchy, styling discipline, and general UI coding
  habits for this repo. Use when adding or changing React UI, building form
  controls, or when the user asks for best practices, DRY UI, or consistency
  with existing primitives.
---

# Software engineering — UI and reuse

## Component decision order

When implementing UI, choose in this order:

1. **Reuse as-is** — Import and use an existing component from `frontend/components/ui/` or shared screens without modification.
2. **Override via composition** — `styled(ExistingComponent)` with theme tokens, or pass existing `className` / styled wrappers; keep behavior in the base component.
3. **Extend with a variant or prop** — Add a prop, variant, or optional slot to an existing component when the change is small and keeps one source of truth.
4. **New component** — Only when nothing above fits; place primitives in `components/ui/` and export from `ui/index.ts`.

Avoid duplicating dropdown/menu/checkbox markup that already exists in `ui/`.

## Styling rules

- Prefer **styled-components** and **theme tokens** (`var(--color-*)`, `type.*` from `theme.ts`).
- **Do not use inline `style={}`** except when values are truly dynamic (e.g. animation progress, drag position, measured layout). For static layout, spacing, and typography, use styled components or CSS variables.

## Repo conventions

- **Dropdown**: use `Dropdown` from `components/ui/Dropdown.tsx` instead of native `<select>` for themed lists.
- **Checkboxes**: use `Checkbox` from `components/ui/Checkbox.tsx` for themed boolean rows (hidden native input for a11y).
- Match existing patterns in `EvidenceEditor`, `SuspectEditorPanel`, and `CaseDetailsPanel` for ownership menus and controls.

## General coding habits

- Read neighboring code before editing; match naming, imports, and abstraction level.
- Keep diffs focused on the task; avoid unrelated refactors.
- After UI changes, run `npx tsc --noEmit` in `frontend/` when types or exports change.
