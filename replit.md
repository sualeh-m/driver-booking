# ShiftControl

Internal HGV/Warehouse shift-booking app for a recruitment agency — a spreadsheet-style editable grid (workers × dates) replacing a Google Sheets workflow. Bookings are organised per **sheet** (client + depot).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 5000)
- `pnpm run typecheck` — full typecheck; `pnpm run typecheck:libs` first after any `lib/*` change
- `pnpm --filter @workspace/api-spec run codegen` — regenerate hooks/Zod from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema (dev only)
- Required env: `DATABASE_URL`

## Stack & where things live

- pnpm workspaces, Node 24, TS 5.9; Express 5; PostgreSQL + Drizzle; Zod (`zod/v4`); Orval codegen; esbuild CJS bundle.
- **Contract-first:** `lib/api-spec/openapi.yaml` is the API source of truth — drives React Query hooks + Zod schemas in `@workspace/api-client-react`. Enums (`JobRole`, `LeaverReason`, `SubmissionOutcome`, `CpcTestStatus`, `EventType`) are defined there ONCE; frontend dropdowns build from the emitted consts. `serialize.ts` converts `Date → ISO string` (generated Zod expects strings; DB date cols use Drizzle `mode: "string"`).
- DB schema source of truth: `lib/db/src/schema/*.ts`, mirroring the user-provided `attached_assets/extracted_files/schema.sql` exactly (see User preferences). Active tables: users, sheets, sheetContacts, workers, workerSheets, bookings, auditLog, messages, events, leavers, submissions; shiftRequirements is read-only (no roster CRUD — deliberate); `session` is infra.
- Backend routes: `artifacts/api-server/src/routes/*.ts`; helpers in `src/lib/` (serialize, auth, session, csv, dates, applyBooking, restCheck, noShow, format, jobTitles); wiring in `src/app.ts`.
- Frontend: `artifacts/driver-grid/src/` — grid in `components/grid/BookingGrid.tsx`, dialogs in `components/grid/dialogs/`, list pages in `pages/` (DoNotBook, Leavers, Submissions, Reports), layout in `components/layout/Shell.tsx`.
- Rest-day rule shared source of truth: `lib/rest-rules/src/index.ts` (thresholds warn=6/block=7; `REST_RULE_JOB_ROLES` = HGV 1, HGV 2, Trunker, Bus/Coach via `isRestRuleJobRole`). Keys off the worker's **job role** — sheets carry no type.

## Key rules & decisions (non-obvious)

- **Auth:** email + password, roles `admin`/`standard`. scrypt hashes (`lib/password.ts`, `scrypt$salt$hash`, no external dep); `express-session` + `connect-pg-simple` cookie (same-origin). NO email/invite flows — admin sets a temp password; `users.must_change_password` forces change on first login / after reset.
- **Authorization is server-side, never UI-only.** Attach `requireAdmin` **PER-ROUTE** — never `router.use(requireAdmin)` (it leaks onto routers registered after it; caused a real bug). Admin-only: user management (with self-delete + last-admin-demote guards), delete a whole sheet, delete a leaver record. Everything else is any logged-in user.
- **Shared booking write path:** the per-cell upsert (insert/update + audit + earliest-`start_date` back-fill + no-show clearing + rest rule + note) lives ONLY in `applyBookingTx` (`lib/applyBooking.ts`), used by both `PUT /bookings` and `PUT /bookings/batch` so batch and single edits can never diverge.
- A **"working shift"** = a booking with `startTime` set; per-day totals count these.
- **Auto-formatting on save** (`api-server/src/lib/format.ts`, every write path): names → Title Case (forced lowercase first, so "HGV" → "Hgv" — accepted tradeoff); UK mobiles normalised to "07123 456789" (unrecognised kept as typed; blank → null). **Worker phone is MANDATORY** (`strictUkMobile`, 400 on invalid); submission candidate phone is formatted but optional. Sheet-contact names deliberately NOT formatted.
- **Sheets:** created from client company + depot only — NO name field. `name` is always derived as `Client — Depot` (`sheetDisplayName` in `serialize.ts`, applied on insert AND on every read) and derived consistently everywhere it appears (selector, CSV filename, dialog titles, Submissions filter/column — the latter via SQL CASE). Sheets carry **no worker type** — any role can join any sheet.
- **Job roles:** fixed set of 9 (HGV 1, HGV 2, Trunker, Bus/Coach, Van, Warehouse, Forklift, Drivers Mate, Other — also the grid sort order via SQL CASE in `grid.ts`). Picking **Other** requires a free-text title (`resolveCustomJobTitle` in `lib/jobTitles.ts` forces it null for all other roles, enforced on every write path); typed titles are remembered in `custom_job_titles` (case-insensitive dedupe) and offered as suggestions, never in the role dropdown. A worker's `worker_type` (HGV/Warehouse) is **derived server-side from the job role** — not user-editable.
- **HGV rest-day check** (rest-rule roles only): per-cell counter of consecutive working days (Confirmed/Pre-Booked count; Rest/Off/Holiday reset); warn at 6 ("Book anyway" dialog), hard server-side block at 7. Batch drag-fill enforces it **per-cell** (`evaluateRestBatchForWorker`): blocked cells are not written and break the streak; warn-acknowledge resubmits ONLY the warned cells.
- **No Show / Do Not Book:** No Show is a sentinel in the cell dropdown, not a booking status — it logs a `no_show` event and renders the cell red. A no-show never outlives its cell (clearing/changing the cell deletes the event(s) in the same txn — `clearNoShowsForDate`, `lib/noShow.ts`). At 5 total no-shows `doNotBook` auto-sets (threshold in `NO_SHOW_AUTO_FLAG_THRESHOLD`); removing a no-show auto-un-flags ONLY when it crosses from ≥5 back to <5 (below-5 flags are manual, never auto-reversed). Flagged workers leave the grid and appear only in the Do Not Book view.
- **Leavers:** `startDate` = first-ever booking date (auto, only ever moves earlier, read-only in UI); `status` active/left. Mark-as-leaver is double-confirmed (type DELETE exactly, then date + reason + notes); endpoint rejects already-left (409). Leavers view shows length of service; **Restore** reactivates. Admin **delete leaver record** is distinct: removes the leaver row(s) but the worker stays `left` (appears nowhere; history preserved).
- **Events are No Show only** — CPC/driving-test results live on Submissions (July 2026 restructure; `EventType` = `[no_show]`, events CHECK narrowed, legacy rows deleted in dev).
- **Submissions:** worker XOR candidate (CHECK `submissions_identity`); always record a sheet (required) + job role. Recording NEVER creates a worker. Each carries `cpc_status`/`test_status` (pending/passed/failed, inline Selects). Outcomes: submitted/cpc_failed/test_failed/passed/rejected. **Passed is blocked (400 + toast) until BOTH statuses are passed**; POST rejects outcome=passed and the create dialog omits it. Marking a status Failed with no explicit outcome auto-sets cpc_failed/test_failed (CPC precedence, user can override); both-passed does NOT auto-set Passed (that stays explicit — it creates the worker). The whole PATCH (statuses + outcome + worker creation) runs in ONE txn with `FOR UPDATE` so concurrent passes can't duplicate workers. Passing creates the candidate as a worker on the recorded sheet (or links an existing worker via `workerSheets` onConflictDoNothing); **un-passing never deletes the worker** (UI warns first). `POST /submissions` overrides any client-supplied sheetId to the linked requirement's sheet.
- **Requirement coverage on the grid:** Required / Filled / Still Needed summary rows under the totals; Required is editable inline (`PUT /requirements/daily`) — the endpoint keeps ONE canonical `shift_requirements` row per sheet+date (updates first, **zeroes** extras to preserve submission FKs, inserts when needed) serialized by `pg_advisory_xact_lock(sheetId, hashtext(date))`. Still Needed is a traffic light.
- **Reports** (`/reports/operational`, `/reports/people`): page-level filters (date range, sheet multi-select, worker type All/HGV/Warehouse) apply to every metric. Sheets are untyped, so the type filter lives on the WORKER: worker metrics use one `eligibleWorkerIds` set; Requirements can't be type-filtered (accepted fill-rate asymmetry). Submitted/Passed are NOT worker-scoped (candidates have no worker) — scoped by the submission's own sheet, type via linked worker else job-role-derived. **CPC/Test failures count submissions with a failed status** (not events), always HGV-only; Warehouse filter → 0; frontend hides the two cards unless the filter is HGV. Retention is a current snapshot, not range-bound. Export: PDF (jspdf) or real .xlsx (lazy exceljs — CSV can't hold the logo); Intrepid Global logo baked as base64 sRGB module (`src/lib/reportLogo.ts`; the source JPEG is CMYK and renders wrong raw).
- **Booking-cell note:** optional free-text `note` per booking (single editor + batch dialog; hidden for No Show sentinel); 📝 indicator on the grid; not audited; blank → null.
- **Grid layout:** raw `<table>` in ONE `flex-1 min-h-0 overflow-auto` div (NOT shadcn Table — its nested wrapper hid the horizontal scrollbar). **`min-h-0` is REQUIRED on every flex child in the height chain** or the horizontal scrollbar becomes unreachable. Sticky header row + sticky Worker column. Day view uses `w-auto`. Past columns dimmed, today highlighted (display-only). Two colour systems: status cell colours (legend at bottom) and pale per-role worker-name cell backgrounds (`ROLE_CELL_BG`). Toolbar is icon-only with tooltips. **Import CSV removed from the UI** but the dialog + server endpoint are intentionally kept in code.
- **Radix Select gotcha:** seed edit forms via `form.reset` INSIDE the click handler before mounting — setting the value in a post-mount effect leaves the Select on its placeholder.
- Client-email / send-confirmation endpoints compute real previews server-side; actual sending (Vincere / MS Graph / Twilio) is Phase 2 stubs.
- **Deliberately NOT built:** shift-requirements roster CRUD.

## Prod migration pending (run at next deploy)

Dev has these applied; prod needs, in one pass:
1. `ALTER TABLE sheets DROP COLUMN worker_type`
2. `UPDATE workers SET job_role='Bus/Coach' WHERE job_role='Coach'`
3. Submissions: add `job_role`/`custom_job_title` columns; add `cpc_status`/`test_status` (TEXT NOT NULL DEFAULT 'pending' + CHECKs `IN ('pending','passed','failed')`); expand `submissions_outcome` CHECK to `(submitted,cpc_failed,test_failed,passed,rejected)`; backfill `cpc_status='passed', test_status='passed'` where `outcome='passed'`
4. Events: `DELETE FROM events WHERE event_type IN ('cpc_failure','test_failure')`; narrow `events_event_type` CHECK to `('no_show')`
5. Data reformat (same as dev July 2026): Title-Case `workers.full_name`, `sheets.client_company`/`depot` (+ re-derive `name` as `Client — Depot`), `submissions.candidate_name`; normalise `workers.phone` and `submissions.candidate_phone` to 07-format

## User preferences

- The user-provided `schema.sql` must be used exactly — EXCEPT the deliberate, user-requested `workers.do_not_book` column (kept in sync in `attached_assets/extracted_files/schema.sql`). No further schema deviations without an explicit request.
- Phase 2 integrations (Vincere, MS Graph, Twilio) are stubs only for now.

## Gotchas

- `connect-pg-simple`'s `createTableIfMissing` does NOT work under the esbuild bundle — the `session` table must exist in the DB (provisioned via Drizzle schema); don't rely on auto-create.
- After any `lib/*` change, run `pnpm run typecheck:libs` before leaf typechecks, or stale lib declarations cause phantom "missing export" errors.
- drizzle-kit push ignores changed CHECK constraints ("No changes") — apply CHECK alters as manual SQL.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
