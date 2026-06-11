---
name: Preview/“send” dialogs backed by POST mutations
description: Why preview dialogs that fire a React Query mutation must be effect-driven, not render-condition-driven
---

In this app, "preview" endpoints (client-email preview, confirmations preview) are POST endpoints, so codegen exposes them as React Query **mutations**, not queries. Mutation result data is retained until `reset()`.

**Rule:** Drive these dialogs from a `useEffect` keyed on `[open, sheetId, start, end]` (string dates compare by value, so they're stable deps). On open/scope-change call `reset()` then `mutate(...)`; on close call `reset()`.

**Why:** The original code auto-fired the mutation from a render-time condition like `if (open && !data && isIdle) mutate()`. Because mutation data persists, switching the selected sheet and reopening the dialog showed the *previous* sheet's preview (stale cross-context data). Caught in code review during the v2 migration.

**How to apply:** Any new dialog that previews/sends per-sheet (or per-scope) data via a mutation hook must follow the effect-driven reset+refetch pattern, and any in-dialog pickers (e.g. worker selector) should be scoped to the current sheet's data (pass the grid's workers in) rather than a global list.
