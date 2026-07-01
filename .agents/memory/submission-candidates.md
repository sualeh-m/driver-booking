---
name: Submissions support standalone candidates (not just workers)
description: A submission can be for an existing worker OR a brand-new candidate who is deliberately NOT a bookable worker; how that XOR identity is modelled and why.
---

# Submissions: worker OR candidate (never a worker side-effect)

A submission is EITHER for an existing `workers` row (`worker_id` set) OR for a brand-new candidate who must NOT become a bookable worker (`candidate_name` set, `candidate_phone` optional, `worker_id` null).

**Why:** the agency often submits someone to a client who is rejected before ever starting — they should exist only as a submission record, never on the grid / Add Worker / any bookable path. Recording a candidate submission must never auto-create a `workers` row. If a candidate later actually starts, they are added as a worker separately via the normal Add Worker flow.

**How it is enforced (both layers):**
- DB CHECK `submissions_identity`: exactly one of (`worker_id`, `candidate_name`) — never both, never neither. `worker_id` is nullable (dropped its original NOT NULL). Because drizzle push ignores CHECK changes, this ALTER (drop NOT NULL, add columns, add CHECK) is applied as manual SQL in dev and must be hand-run in prod.
- Server `POST /submissions`: trims `candidateName`, XOR-validates worker vs candidate (400 on both/neither/blank), keeps the worker-exists check only for the worker branch.

**Display / consumers:**
- `workerName` in the API response is `coalesce(worker.full_name, candidate_name)`, so lists/tables keep a non-null display name for both kinds; `workerId === null` is the "this is a candidate" signal (UI shows a Candidate badge + phone, no worker-profile link).
- Candidates are naturally EXCLUDED from worker-centric KPI reports because those scope submissions via `inArray(submissions.workerId, eligibleWorkerIds)` and a candidate's `worker_id` is null. This is intentional and non-breaking — candidates have no worker type to scope by.
- Workers list / grid / Add Worker read only `workersTable`, so candidates can never leak into bookable paths.
