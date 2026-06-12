---
name: Batch grid edit + per-cell rest rule
description: How drag-fill batch booking stays equivalent to single-cell edits, especially the rest-day warn/block accumulation and the warn-ack resubmit.
---

# Batch grid edit must equal single-cell, cell by cell

When a grid edit is applied to many cells at once (drag-fill rectangle), the
hard requirement is that each cell behave **exactly** like a single edit.

## Rules that make this true

- **One shared write path.** Extract the per-cell upsert (insert/update + audit
  + any side effects like start_date back-fill, no-show clearing) into a single
  tx helper used by BOTH the single endpoint and the batch. Never reimplement the
  write in the batch route, or the two paths drift.

- **Per-cell rest-rule accumulation, in date order, with the SAME primitives.**
  Group the selection by worker; classify each date ascending using an in-memory
  accumulator seeded from the DB. warn cells count toward later runs; **blocked
  cells are NOT written, so they break the streak.** A date AFTER a blocked gap
  legitimately resets its consecutive count to 1 and can be bookable — this is
  correct and matches single-cell (a blocked cell is never saved, so it is a
  gap). Do not "block everything after the first block"; that diverges from
  single-cell semantics.

## Warn → acknowledge resubmit (the subtle one)

First pass (ack=false): apply ok cells immediately, hold back warn cells, report
blocked. On "Book anyway", resubmit **only the warned cells** with ack=true —
NOT the full original selection.

**Why:** the classifier is ack-independent (decisions come from dates + DB
state, not from the ack flag). The first-pass ok cells are already persisted, so
re-evaluating just the warned dates against them yields identical decisions.
Resubmitting the whole rectangle would re-write already-saved rows — bumping
`updated_at` and clobbering any concurrent edit made between the two passes.

**How to apply:** store the first-pass result's `applied` + `blocked` in the
warn dialog state; on confirm, send `warnings.map(w => coords)`; on success,
summarize over `[...priorApplied, ...ackApplied]` and `priorBlocked`.

## Controlled cell popover during drag

To keep single-click editing while adding drag: drive the cell's Popover with an
external `openCellKey` and use `PopoverAnchor` (not `PopoverTrigger`, which would
toggle on the mousedown that starts a drag). Mouse-up resolves a 1-cell "drag"
to opening that cell's editor, ≥2 cells to the batch dialog. Bind the window
mouseup once via a render-set ref so the latest selection is always seen without
re-subscribing. Put `select-none` on the table to stop text selection mid-drag.
