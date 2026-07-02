---
name: KPI report scoping with untyped sheets
description: How ShiftControl's /reports metrics scope by depot/client + worker type now that sheets carry NO worker type — the type filter lives on the worker, requirements can't be type-filtered.
---

# KPI report scoping: worker-type filter lives on the WORKER

Sheets carry NO worker type (the `sheets.worker_type` column was removed by
explicit user request — any role on any sheet). The reports endpoints filter by
depot/client (multi-select of `clientCompany`+`depot` combos, passed as
comma-separated `sheetIds`) AND by worker type (HGV/Warehouse, omit = both),
where a worker's own `worker_type` (derived from job role) is the ONLY source
of type.

**Operational (`/reports/operational`):** one depot/client sheet set,
`depotClientSheetIds`.
- **Active workers**: worker-centric — `workerSheets` link into the set +
  `workers.worker_type` for the type filter.
- **Filled / no-shows**: join `workers` on the booking/event's worker and apply
  `workers.worker_type` when the filter is set.
- **Requirements**: have NO worker attached (`shift_requirements.job_role`
  mostly null), so they always cover the FULL depot/client selection and cannot
  be type-filtered. Accepted tradeoff: with a worker-type filter, fill-rate's
  numerator is type-filtered while the denominator is not — inherent once
  sheets are untyped; surfaced to the user, not a bug.

**Active-workers all-vs-subset rule:** when no depot/client is selected (all),
count every active worker of the type WITHOUT requiring a `workerSheets` link
(unlinked workers still count). When a subset is selected, REQUIRE a link to one
of the selected sheets. Frontend sends `sheetIds` only for a subset; "all" omits
it. Empty selection sends a non-existent id (e.g. `-1`) so the server returns
zeros rather than treating empty as "all".

**How to apply:** `fillRate` is null when requirements = 0 (UI shows "—").
Counts that traverse `workerSheets` must use `countDistinct(workers.id)` to
avoid many-to-many overcount.

## People metrics — ONE worker-centric set

`/reports/people` (submissions/passed, leavers, leaver-reason breakdown,
retention, CPC/test failures) resolves a SINGLE `eligibleWorkerIds` set: workers
whose own `worker_type` matches the filter AND (only when a depot/client subset
is ticked) are linked via `workerSheets` to a selected sheet. Each metric is
scoped with `inArray(table.workerId, eligibleWorkerIds)` using an
`IN (subquery)`, NOT a join to `workerSheets` — a join would multiply rows for a
worker linked to several selected sheets and over-count. (The operational
`countDistinct` trick is the join-based alternative; here the IN-subquery
sidesteps the join entirely.)

**Retention is a snapshot, not range-bound.** Submissions/leavers/failures are
bounded by their own date in `[start,end]`; retention buckets ALL eligible
workers with a `start_date` by service length (`start_date`→`max(leavers.leave_date)`
for left workers, `start_date`→today for active), regardless of the date range.
Null `start_date` → counted as "Not started", excluded from buckets. Bucket
day-thresholds are contiguous (`<7 / <28 / <90 / <180 / 180+`) so everyone with
a start date lands in exactly one.

**CPC/test are HGV-only for free:** those events can only be created against
HGV workers, so a Warehouse worker-type filter yields zero without
special-casing. Empty eligible set → return an all-zero but fully-structured
payload (all 7 reasons, all 5 buckets) so the UI never breaks on missing keys.
