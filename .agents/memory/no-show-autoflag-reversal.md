---
name: No-show auto-flag reversal without an origin column
description: How ShiftControl decides whether removing a no-show may reverse a Do Not Book flag, given there is no column recording why a worker was flagged.
---

# Reversing the no-show auto-flag (manual vs auto, no schema support)

`workers.do_not_book` is a plain boolean with NO column recording *why* it was set,
and the schema is frozen (only `do_not_book` itself was an allowed deviation). So we
cannot store "auto vs manual" directly.

## Rule
When removing a no-show, reverse `doNotBook` ONLY when the worker's TOTAL no-show
count crosses from `>= threshold` (5) back down to `< threshold`, AND they are
currently flagged. Implemented in `artifacts/api-server/src/lib/noShow.ts`
(`reconcileAutoFlag`): compute `before = remaining + removed`; reverse iff
`before >= 5 && remaining < 5`.

**Why this is safe:** the ONLY programmatic path to `doNotBook = true` is the
auto-flag at 5 no-shows, and it only fires while crossing UP *and* only when the
worker is not already flagged (`.where(doNotBook = false)` guard). There is no UI
to manually set the flag true (the Do Not Book view only ever sets it false).
Therefore a worker flagged while still **below** 5 no-shows must have been flagged
manually (via direct API) → never auto-un-flag them. The crossing test captures
exactly the auto-flag boundary.

**Residual edge (documented, not reachable via UI):** a worker manually flagged via
direct API who *also* accumulates ≥5 no-shows would be auto-un-flagged on crossing
back below 5. Acceptable because manual flag-on has no UI surface. If a manual
flag-on feature is ever added, this needs an origin marker (e.g. a flag-reason
column) to stay correct.

## How to apply
- Threshold lives once as `NO_SHOW_AUTO_FLAG_THRESHOLD` in `lib/noShow.ts`; the
  auto-flag-ON logic in `routes/events.ts` imports it. Keep them in lockstep.
- Every no-show REMOVAL path must run the reconciliation: booking upsert (PUT
  /bookings, both branches), booking delete (DELETE /bookings/:id), the dedicated
  `DELETE /workers/:workerId/no-shows/:shiftDate`, and `DELETE /events/:id` when the
  deleted event is a `no_show`. All call into `lib/noShow.ts` inside a transaction.
