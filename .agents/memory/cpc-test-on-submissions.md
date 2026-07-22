---
name: CPC/test tracking on submissions
description: CPC and driving-test results live on submissions, not worker events; passing gates worker creation.
---

CPC and driving-test results are per-submission statuses (`cpc_status`/`test_status`: pending/passed/failed), not worker events — candidates can fail before ever becoming a worker. Worker events are no-shows only.

**Rules:**
- Outcome `passed` requires BOTH statuses passed (400 otherwise; also blocked on create since statuses start pending).
- Marking a status failed with no explicit outcome auto-sets `cpc_failed`/`test_failed` (CPC precedence); explicit outcome always wins and users can override afterwards.
- Both-passed does NOT auto-set the outcome to Passed — passing creates/links the worker, so it must stay an explicit action.
- The whole PATCH (statuses + outcome + worker creation) runs in one txn with `FOR UPDATE` (same lock that prevents duplicate worker creation).
- KPI CPC/Test failure counts come from submissions (status='failed'), always HGV-only via linked worker type or job-role-derived type; Warehouse filter → 0; must be computed even when the eligible-worker set is empty (candidates have no worker).

**Why:** the user explicitly moved CPC/test out of worker events — they happen during recruitment, pre-worker. Keeping them as events double-counted and couldn't cover candidates.
