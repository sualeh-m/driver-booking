---
name: Orval query-options require queryKey
description: Conditional React Query hooks (e.g. enabled) from orval codegen need queryKey passed explicitly or typecheck fails.
---

The orval-generated `use<Op>` query hooks in `@workspace/api-client-react` type their
`query` options as `UseQueryOptions<...>` **with `queryKey` required**. Passing only
`{ query: { enabled } }` fails typecheck with TS2741 ("Property 'queryKey' is missing").

**Fix:** pass the generated key alongside, e.g.
`useListWorkerEvents(id, { query: { enabled: open, queryKey: getListWorkerEventsQueryKey(id) } })`.

**Why:** orval merges your options over its defaults but the public type still demands
`queryKey`; the runtime would default it, but TS does not know that.

**How to apply:** whenever you set `enabled` (or any conditional query option) on one of
these generated hooks, also pass `get<Op>QueryKey(...)`.
