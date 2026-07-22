---
name: Submissions support standalone candidates (not just workers)
description: A submission can be for an existing worker OR a brand-new candidate; how the XOR identity works, how a Pass converts the candidate to a worker, and how KPIs count candidate submissions.
---

# Submissions: worker OR candidate (worker only created on Pass)

A submission is EITHER for an existing `workers` row (`worker_id` set) OR for a standalone candidate (`candidate_name` set, `worker_id` null). Every submission also records a required sheet and job role (`job_role` + `custom_job_title` for Other).

**Why:** the agency submits people who may be rejected before starting — they must not appear on any bookable path while Submitted/Rejected. The recorded sheet + role exist so a later Pass knows exactly where/what to place them as.

**Lifecycle rules:**
- Recording a submission NEVER creates a worker.
- Outcome → **Passed** converts: candidate → new worker (name, phone only if valid UK mobile else null, role/derived type/custom title from the submission) + `worker_sheets` link; existing worker → just the sheet link (`onConflictDoNothing`). All in ONE txn that **re-reads the submission `FOR UPDATE`** — without the row lock, two concurrent pass-transitions both saw `worker_id null` and created duplicate workers (caught in review, proven by a parallel-PATCH test).
- On conversion the submission gets `worker_id` set and `candidate_name` nulled (identity CHECK: exactly one of the two).
- Passed → Submitted/Rejected NEVER deletes the worker; the frontend confirms with an AlertDialog saying the worker stays.
- Legacy rows missing sheet/role are 400-rejected on pass with a "re-record" message.

**DB CHECK `submissions_identity`:** exactly one of (`worker_id`, `candidate_name`). drizzle push ignores CHECK changes, so these ALTERs (plus `job_role`/`custom_job_title` columns) are manual SQL — dev applied; prod pending at next deploy.

**Display / KPIs:**
- API `workerName` = `coalesce(worker.full_name, candidate_name)`; `workerId === null` is the "candidate" UI signal.
- KPI Submitted/Passed must NOT be scoped via `eligibleWorkerIds` (candidates have no worker and were silently zeroed — real bug). They are scoped by the submission's own `sheet_id`; the worker-type filter uses the joined worker's type when linked, else a type derived from `submissions.job_role` (HGV-role CASE). Null-role legacy candidates count only when no type filter. The empty-eligible-workers short-circuit must still compute submissions.
