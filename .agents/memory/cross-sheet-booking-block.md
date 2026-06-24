---
name: Cross-sheet booking hard block
description: Why a worker can't hold a working booking on two sheets the same day, and the non-obvious rest + atomicity rules around enforcing it.
---

**Decision:** a worker is ONE person across all sheets. If they already have a
WORKING booking (Confirmed/Pre-Booked) on a DIFFERENT sheet that day, HARD BLOCK
any booking write from another sheet — never silently move/overwrite it.

**Why:** the bookings table allows only one row per worker/day, so the old
upsert-by-(worker,day) write path silently reassigned a booking's sheet, hiding a
real double-booking. A block surfaces the conflict to the user instead.

**How to apply — enforce on EVERY booking write path, not just the obvious one.**
There are three: single PUT, batch PUT, and the (UI-hidden but live) CSV import.
A reviewer caught the import path still reassigning after the first two were
fixed. Any new write path must run the same shared conflict check.

**Two traps when enforcing:**
- *Rest accumulation:* the HGV rest rule is cross-sheet. A conflict date is a
  genuine working day on the other sheet, so it must KEEP counting toward later
  cells' consecutive-day runs — do NOT drop it from accumulation the way a
  rest-blocked cell is dropped. Excluding it under-counts.
- *Atomicity (TOCTOU):* the conflict check and the write must be one transaction
  holding a per-worker advisory lock to commit, or a concurrent writer slips a
  working booking onto another sheet between check and apply. Batch acquires all
  its workers' locks in ascending-id order first to avoid batch-vs-batch
  deadlocks. Per-worker (not per worker+date) keeps locking simple.

**Add Worker dialog** gained a "create new" vs "add existing" toggle so a worker
can be linked to a second sheet (idempotent link insert) without creating a
duplicate worker row.

**Data gotcha:** seed/real data contains workers with IDENTICAL full names, so any
name-based worker lookup (e.g. the CSV import's `limit 1` match) is ambiguous and
can resolve to the wrong person. Never trust name as a worker identity key.
