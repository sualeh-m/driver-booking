---
name: KPI report two-set sheet scoping
description: How ShiftControl's /reports metrics scope by depot/client + worker type using two distinct sheet-id sets, so worker-centric and sheet-centric metrics stay correct together.
---

# KPI report scoping: two sheet-id sets, not one

The operational reports endpoint filters by depot/client (a multi-select of
`clientCompany`+`depot` combos, passed as comma-separated `sheetIds`) AND by
worker type (HGV/Warehouse, omit = both). These two filters interact differently
depending on whether a metric is worker-centric or sheet-centric, so the server
resolves TWO sheet-id sets from the selected sheets:

- `depotClientSheetIds` = the selected sheets **regardless of worker type**.
- `scopedSheetIds` = those that ALSO match the worker-type filter.

**Why two sets:**
- **Active workers** is worker-centric: a worker belongs to a depot/client via a
  `workerSheets` link, and the worker's OWN `worker_type` is the type filter. So it
  uses `depotClientSheetIds` for the link + `workers.worker_type` for the type.
  (A sheet has a fixed worker type, but the worker is the source of truth here.)
- **Requirements / filled / no-shows** are sheet-centric (no worker type column of
  their own — type comes from the sheet). They use `scopedSheetIds` so that
  requirements (denominator) and filled (numerator) cover the SAME sheet set and
  fill-rate stays coherent. Using one combined set would either drop HGV workers
  booked under the wrong sheet or double-count across types.

**Active-workers all-vs-subset rule:** when no depot/client is selected (all),
count every active worker of the type WITHOUT requiring a `workerSheets` link
(unlinked workers still count). When a subset is selected, REQUIRE a link to one of
the selected sheets. Frontend sends `sheetIds` only for a subset; "all" omits it.
Empty selection sends a non-existent id (e.g. `-1`) so the server returns zeros
rather than treating empty as "all".

**How to apply:** `fillRate` is null when requirements = 0 (UI shows "—"). Counts that
traverse `workerSheets` must use `countDistinct(workers.id)` to avoid many-to-many overcount.

## People-metrics half (built) — ONE worker-centric set, not two

`/reports/people` (submissions/passed, leavers, leaver-reason breakdown, retention,
CPC/test failures) does NOT use the two-set model — every people metric is
worker-centric, so it resolves a SINGLE `eligibleWorkerIds` set: workers whose own
`worker_type` matches the filter AND (only when a depot/client subset is ticked) are
linked via `workerSheets` to a selected sheet. Each metric is scoped with
`inArray(table.workerId, eligibleWorkerIds)` using an `IN (subquery)`, NOT a join to
`workerSheets` — a join would multiply rows for a worker linked to several selected
sheets and over-count. (The operational `countDistinct` trick is the join-based
alternative; here the IN-subquery sidesteps the join entirely.)

**Retention is a snapshot, not range-bound.** Submissions/leavers/failures are bounded
by their own date in `[start,end]`; retention buckets ALL eligible workers with a
`start_date` by service length (`start_date`→`max(leavers.leave_date)` for left workers,
`start_date`→today for active), regardless of the date range. Null `start_date` →
counted as "Not started", excluded from buckets. Bucket day-thresholds are contiguous
(`<7 / <28 / <90 / <180 / 180+`) so everyone with a start date lands in exactly one.

**CPC/test are HGV-only for free:** those events can only be created against HGV
workers, so a Warehouse worker-type filter yields zero without special-casing. Empty
eligible set → return an all-zero but fully-structured payload (all 7 reasons, all 5
buckets) so the UI never breaks on missing keys.
