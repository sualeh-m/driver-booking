# ShiftControl

Internal HGV/Warehouse shift-booking app for a recruitment agency — a spreadsheet-style editable grid (workers × dates) that replaces the team's Google Sheets workflow. Bookings are organised per **sheet** (a client depot + worker type).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/*.ts` — mirrors the user-provided v2 `attached_assets/extracted_files/schema.sql` exactly. Active tables: users, sheets, sheetContacts, workers, workerSheets, bookings, auditLog, messages, events, leavers, submissions. shiftRequirements is read-only (exposed for linking submissions; the roster itself is not managed in-app). `session` is infra (provisioned via Drizzle, see Gotchas).
- API contract (source of truth): `lib/api-spec/openapi.yaml` — drives codegen (React Query hooks + Zod schemas in `@workspace/api-client-react`). Enums (`JobRole`, `LeaverReason`, `SubmissionOutcome`) are defined here ONCE and emitted as consts the frontend dropdowns build from.
- Backend routes: `artifacts/api-server/src/routes/*.ts`; helpers in `artifacts/api-server/src/lib/` (serialize, auth, session, csv, dates, applyBooking, restCheck, noShow); wiring in `src/app.ts`.
- Frontend: `artifacts/driver-grid/src/` — grid in `components/grid/BookingGrid.tsx`, dialogs in `components/grid/dialogs/`, list pages in `pages/` (DoNotBook, Leavers, Submissions, Reports), layout in `components/layout/Shell.tsx`.
- Rest-day rule (shared): `lib/rest-rules/src/index.ts` — single source of truth for thresholds (`REST_DAY_RULES`, default warn=6/block=7), the job roles it applies to (`REST_RULE_JOB_ROLES` = `["HGV 1","HGV 2","Trunker","Bus/Coach"]`, gated via `isRestRuleJobRole`), and the consecutive-working-day logic used by both server (`bookings.ts`, `grid.ts`) and frontend. The rule keys off a worker's **job role** (sheets carry no type) — so it applies to those 4 roles on any sheet and never to the others.

## Architecture decisions

- **Contract-first:** OpenAPI generates client hooks and Zod validators; `serialize.ts` converts `Date → ISO string` because generated Zod expects strings (DB date cols use Drizzle `mode: "string"`).
- **Auth:** email + password, two roles (`admin`/`standard`). Passwords hashed with Node's built-in scrypt (`lib/password.ts`, format `scrypt$salt$hash`, no external dep). Session cookie via `express-session` + `connect-pg-simple`; same-origin so cookies auto-send. Mutations read `req.session.userId` for the audit trail. NO email/invite flows — an admin sets a temp password and the user is forced to change it on first login / after reset (`users.must_change_password`).
- **Authorization is server-side, never UI-only:** admin-only routes attach `requireAdmin` (from `lib/auth.ts`) **PER-ROUTE** — never `router.use(requireAdmin)`, which leaks the gate onto every router registered after it (caused a real bug blocking standard users from `/sheets`). Admin-only capabilities: user management (`routes/users.ts` CRUD + reset-password, with self-delete and last-admin-demote guards), delete a whole sheet, delete a leaver record. Everything else is allowed for any logged-in user.
- A **"working shift"** = a booking with `startTime` set; per-day totals count these.
- **Shared booking write path:** the per-cell upsert (insert/update + audit + earliest-`start_date` back-fill + no-show clearing + rest-rule + note) lives in ONE place — `applyBookingTx` (`lib/applyBooking.ts`) — used by BOTH the single `PUT /bookings` and `PUT /bookings/batch`, so a batched cell can never diverge from a single edit.
- Client-email and send-confirmation endpoints compute real previews server-side; actual sending (Vincere / MS Graph / Twilio) is deferred to Phase 2 stubs.

## Product

Spreadsheet-style grid (workers down, dates across) scoped to the selected **sheet**, with Day/Week/Month toggle (Week = Sun–Sat, Month from 1st), inline status + 24h start-time editing, colour-coded status cells, per-worker standing note column, and per-day working-shift totals. Email/password login with two roles, forced password change on first login / after reset, full audit trail, Activity view.

### Grid layout & shading

- **One scroll container:** a raw `<table>` inside a single `flex-1 min-h-0 overflow-auto` div (NOT shadcn `Table`, whose nested wrapper hid the horizontal scrollbar). **`min-h-0` is REQUIRED on every flex child in the height chain** (`Shell` → `Grid.tsx` wrapper → `BookingGrid`) — without it the scroll div balloons to full content height and the horizontal scrollbar sits below all rows, unreachable. Header row is `sticky top-0`; the left **Worker** name column is `sticky left-0` (header z-20). Table is `w-full` in Week/Month but `w-auto` in **Day view** (`isDayView = days.length === 1`) so the lone column stays compact.
- **Past/today shading (display-only, status colours unchanged):** past columns dimmed (`opacity-70` over `bg-muted/50` — intentionally fades past bookings too); **today** highlighted (header `bg-primary/10` + ring + "· Today"; body `bg-primary/5`); future normal.
- **Two independent colour systems** (in `BookingGrid.tsx` / `index.css`): (1) **status cell colours** (muted, dark-text-on-light): Available=soft yellow, Pre-Booked=soft orange, Confirmed=green, Rest=white, Off=soft grey, Holiday=black with white ✕, No Show=red; the bottom legend mirrors these. (2) **worker-name CELL background by job role** (`ROLE_CELL_BG`, applied to the sticky name cell): HGV 1=green, HGV 2=teal, Trunker=light purple, Bus/Coach=dusty rose, Van=soft blue, Forklift=muted amber, Drivers Mate=grey-blue, Warehouse=brown/tan, Other/unknown=default. Fills are PALE so the dark name text stays readable; the name text itself is not colour-shaded.
- **Toolbar is icon-only** (`GridToolbar.tsx`: each a `size="icon"` Button with Radix tooltip + `aria-label`): Add Worker, New Sheet, Sheet Settings, Export CSV (client-side), Email-to-client preview, Send-confirmations preview. **Import CSV was removed from the UI** (the `ImportCsvDialog` component and server CSV-import endpoint in `grid.ts` are intentionally kept in code, just not surfaced).

### Sheets

- Created via **New Sheet** (client company + depot only — **NO sheet-name field**). Sheets carry **NO worker type**: any worker of any job role can be added to any sheet (removed by explicit user request; `sheets.worker_type` dropped from the DB and `attached_assets/extracted_files/schema.sql`). The sheet `name` is auto-derived as `Client — Depot` (em dash) via `sheetDisplayName` in `serialize.ts`, used on insert AND in `serializeSheet` (derived on every read), so existing sheets and any future client/depot change always display in that format; falls back to just the client when depot is blank. The selector shows just `name`. Sheet name is derived consistently everywhere it appears (selector, CSV filename, dialog titles, Submissions page filter + Sheet column — the latter via a SQL CASE in `submissions.ts`). `/sheets` is ordered by clientCompany, depot to match.
- **Sheet Settings** manages multiple client contacts (one primary). Email-to-client preview uses the primary contact.

### Auto-formatting on save (names & phones)

Server-side, applied on every write path (`api-server/src/lib/format.ts`); existing dev data migrated July 2026. **Names** (`formatName`): trim + collapse whitespace, force to lowercase, then uppercase the FIRST letter of each word — proper Title Case regardless of input, so "JOHN SMITH", "john smith" and "jOhN sMiTh" all become "John Smith" (acronyms like "HGV" therefore become "Hgv" — accepted tradeoff for consistent casing). Applied to worker `fullName` (POST/PATCH + CSV import), sheet `clientCompany`/`depot` (POST/PATCH, with `name` re-derived), and submission `candidateName`. **UK mobiles** (`formatUkMobile`): strip non-digits; accept `7XXXXXXXXX` (add 0), `07XXXXXXXXX`, `447.../+44...` (→ 0); output "07123 456789" (space after 5 digits); anything unrecognised is kept as typed (trimmed); blank → null. Applied to worker `phone` (POST/PATCH + CSV import) and submission `candidatePhone`. Sheet-contact names are deliberately NOT formatted. **Prod (next deploy):** run the same data reformat against prod (workers.full_name/phone, sheets.client_company/depot + re-derive name, submissions.candidate_name/phone) alongside the pending `ALTER TABLE sheets DROP COLUMN worker_type` and Coach→Bus/Coach UPDATE.

### Job roles & worker type

- A worker's **job role** is a fixed set of 9 (HGV 1, HGV 2, Trunker, Bus/Coach, Van, Warehouse, Forklift, Drivers Mate, Other — also the grid's role sort order, via a SQL CASE in `grid.ts`), defined once as the `JobRole` enum. (The role was renamed "Coach" → "Bus/Coach" July 2026; prod needs `UPDATE workers SET job_role='Bus/Coach' WHERE job_role='Coach'` on next deploy.) It is a Select wherever a worker's role is set/edited.
- **"Other" custom job title:** picking Other requires a free-text job title (`workers.custom_job_title`, forced null for every other role — the rule lives once in `resolveCustomJobTitle`, `api-server/src/lib/jobTitles.ts`, enforced on POST /workers, PATCH /workers/{id}, and CSV import where the raw unrecognised role text becomes the title). Typed titles are remembered in `custom_job_titles` (case-insensitive dedupe via unique index on `lower(title)`; first casing wins) and served alphabetically by `GET /job-titles`; the dialogs' title field (`CustomJobTitleInput`, shared by AddWorker + WorkerProfile) filters them live client-side. Custom titles NEVER appear in the JobRole dropdown. Grid sort: Others keep group position 9 but sort alphabetically by `lower(custom_job_title)` within it (NULLS LAST), then name. Display: grid name cell and profile show the custom title in place of/next to "Other".
- A worker's **`worker_type`** (HGV or Warehouse, CHECK unchanged) is **DERIVED server-side from the job role** (`workerTypeForJobRole` in `routes/workers.ts`) on POST and PATCH — no longer user-editable; dialogs have no worker-type field. Changing the role immediately re-governs the rest-day rule and HGV-only event checks (both read `workers.job_role` live).
- **Sheets carry no worker type** — CSV import derives each imported worker's type from its row's job role (HGV-type roles → HGV, otherwise Warehouse).

### HGV rest-day safety check

For HGV-type roles only (HGV 1, HGV 2, Trunker, Bus/Coach — `isRestRuleJobRole`, keyed off the worker's job role; sheets carry no type), each cell shows a per-day counter (white pill) of consecutive working days (Confirmed/Pre-Booked count; Rest/Off/Holiday reset). Booking into a working status: at warn (6) it warns but allows via a "Book anyway" dialog; at block (7) it is blocked server-side. Other roles have no limit and no counter, on any sheet.

### Worker profile, events, leavers

- **Profile + edit:** the worker-name cell (and worker names on the list pages) opens `WorkerProfileDialog` — a view mode plus **Edit** mode (react-hook-form + zod) for full name, phone, job role, and (grid context only, when `sheetId` is passed) the per-sheet standing note. Saves via `PATCH /workers/{id}` updating the existing row in one txn — NO duplicate worker. **start_date is read-only** (auto-derived from first booking). Worker type shown read-only (derived). Events reached from the profile via an "Events & history" button.
- **Event logging** (`EventsDialog` → `POST /events`): types No Show (`no_show`), CPC Failure (`cpc_failure`), Test Failure (`test_failure`). **CPC/Test are HGV-only — enforced server-side** (400 if violated); Warehouse workers get only No Show. List shows all of a worker's events regardless of sheet.
- **Do Not Book + No Show:** workers carry a `doNotBook` boolean. Flagged workers are filtered off the bookable grid and surface only in the **Do Not Book** view with an "Allow booking again" un-flag (`PATCH /workers/{id}/do-not-book`). The cell status dropdown has a red **No Show** option (a sentinel, not a booking status) logging a `no_show` event for that date. Backstop: at 5 total `no_show` events `doNotBook` auto-sets true (crosses up once, still manually reversible); response carries `autoFlagged`. A `no_show` date renders the cell red with white "No Show" text (from the grid response's `noShows` array, so it persists). **A no-show never outlives its cell:** clearing/changing a cell removes the underlying `no_show` event(s) in the same txn (`clearNoShowsForDate`, `lib/noShow.ts`); a no-show-only cell is cleared via `DELETE /workers/{workerId}/no-shows/{shiftDate}`. **Auto-flag reversal:** removing a no-show un-flags ONLY when it crosses the total from ≥5 back to <5 (a worker flagged while below 5 was manual and is never auto-un-flagged). Threshold lives once in `NO_SHOW_AUTO_FLAG_THRESHOLD` (`lib/noShow.ts`).
- **Leaver tracking:** workers carry `startDate` (= first-ever booking date, set on booking write paths; only ever moves EARLIER; null → "Not started") and `status` ('active'/'left'). Mark-as-leaver: a destructive **Mark as Leaver** button on the FRONT of `WorkerProfileDialog` (active workers only) opens `MarkLeaverDialog` as a stacked sibling (NOT closing the profile — callers conditionally mount it, so closing would unmount the leaver dialog mid-flow). Two-step **double confirmation**: step 1 requires typing **DELETE** exactly (no trim; Continue disabled otherwise); step 2 records leave date, reason (`LeaverReason` enum, CHECK-constrained, labelled by `LEAVER_REASON_LABELS`), optional notes → `POST /workers/{id}/leave`. **Idempotency:** the endpoint rejects an already-`left` worker (409, no duplicate row); the frontend invalidates the worker query on success so the button disappears. The same dialog is still reachable from the Events dialog, so both entry points share the DELETE safeguard. Leavers drop off the grid and show in the **Leavers** view with leave date, reason, and length of service (`serviceDays`). Reversible **Restore** (`POST /workers/{id}/restore`) deletes the worker's leaver rows and reactivates.

### Requirements, submissions, coverage

- **Shift requirements are NOT managed in-app** (no roster CRUD); exposed read-only (`GET /requirements`) only so submissions can link to an existing client need.
- **Submission tracking** (`Submissions` view + `RecordSubmissionDialog`): links worker, optional sheet + (sheet-scoped) requirement, submitted date, outcome (`SubmissionOutcome` enum, CHECK-constrained). Outcome settable on create and changeable inline (`PATCH /submissions/{id}`). View filters by sheet + submitted-date range; linked submissions show submitted-count vs the requirement's `quantity_needed` (a scalar subquery over ALL submissions for that requirement, independent of filters). **Requirement→sheet invariant:** `POST /submissions` overrides any client-supplied `sheetId` to the requirement's sheet.
- **Requirement coverage on the grid:** three summary rows under "Total Working Shifts", aligned to the date columns — **Required** (Σ `shift_requirements.quantity_needed` for the sheet/day, from a per-day aggregate on `GET /grid`), **Filled** (Confirmed/Pre-Booked that day, client-side), **Still Needed** (`max(0, Required − Filled)`). The **Required** row is editable inline (`PUT /requirements/daily`): because per-role roster CRUD is deliberately out of scope, the endpoint keeps ONE canonical `shift_requirements` row per sheet+date (updates the first, **zeroes** extras to preserve submission FKs, inserts when none and `required > 0`); a transaction-scoped `pg_advisory_xact_lock(sheetId, hashtext(date))` serializes concurrent edits; `required` floored via `Math.trunc`. **Still Needed** is a traffic light: neutral (nothing required), red (nothing booked), amber (partial), green (`filled >= required`).

### Reports (KPI)

A **Reports** view with page-level filters applied to EVERY metric: date range (weekly Sun–Sat / monthly 1st–last / custom from-to), depot/client multi-select tickboxes (→ comma-separated `sheetIds`), worker type All/HGV/Warehouse.

- **Export:** header Export dropdown (disabled while loading/fetching) exports the CURRENT filtered view as PDF (jspdf + jspdf-autotable) or real Excel .xlsx (exceljs, lazily imported). Both embed the Intrepid Global logo, baked in as a base64 sRGB module (`src/lib/reportLogo.ts`, trimmed/converted from the CMYK source JPEG) — client-side only, no API changes. Excel failures surface a destructive toast.
- **Operational** (`GET /reports/operational`): Active workers, Requirements received, Filled, Fill rate %, No-shows. Sheets carry no type, so the worker-type filter is applied via the WORKER's own `worker_type`: Filled and No-shows join `workers` when the filter is set; Requirements have no worker attached so they always cover the full depot/client selection (fill-rate numerator can be type-filtered while the denominator is not — inherent once sheets are untyped).
- **People** (`GET /reports/people`, same params): Submitted, Passed, Pass rate %, Leavers, Leaver-reasons breakdown (all 7 reasons always shown), Retention by length of service (contiguous buckets `<7 / <28 / <90 / <180 / 180+` days + a separate "Not started"), CPC failures, Test failures. **Worker-centric scoping:** one `eligibleWorkerIds` set (worker_type matches AND, for a subset, linked via `workerSheets`), applied via `inArray` (an `IN (subquery)`, not a join, so no double-counting). **Retention is a current snapshot, not range-bound.** An empty eligible set short-circuits to an all-zero but fully-structured response.

### Booking entry extras

- **Drag-fill batch booking:** mouse-down + drag + release fills a rectangle of cells; a single-cell "drag" (no movement) opens the normal editor; 2+ cells open `BatchFillDialog` (status picker — No Show sentinel excluded — plus a 24h start time). Writes every cell via `PUT /bookings/batch` through the shared `applyBookingTx`, all in ONE transaction. **Rest rule enforced PER-CELL** (`evaluateRestBatchForWorker`, `lib/restCheck.ts`): dates classified ascending with in-memory accumulation; warn cells count toward later runs, **blocked cells are NOT written so they break the streak**. First pass applies ok cells, holds warn cells, reports blocked; if any warn, an AlertDialog confirms and resubmits ONLY the warned cells (the already-applied ok cells are never re-sent).
- **Booking-cell note:** each booking carries an optional free-text `note` (nullable `note TEXT` on `bookings`) alongside status + start time. Both the single-cell editor and `BatchFillDialog` show an optional Note textarea (hidden for the No Show sentinel); blank saves as `null`. The grid shows a small 📝 indicator with the note in `title`/`aria-label`. Threaded through `applyBookingTx` and serialized via `serializeBooking`. Notes are NOT audited and CSV import defaults them null.

### Admin-only destructive deletes

Server-enforced via per-route `requireAdmin` AND hidden in the UI for standard users (gated on `useGetCurrentUser().role === 'admin'`):
- **Delete a whole sheet** (`DELETE /sheets/{sheetId}`): `bookings.sheet_id` is `ON DELETE RESTRICT`, so the handler deletes the sheet's bookings in the same txn first; the rest cascades or sets null. UI in `SheetSettingsDialog` (Danger Zone + confirm), clearing the selected sheet via an `onSheetDeleted` callback.
- **Delete a leaver record** (`DELETE /leavers/{workerId}`): deletes the leaver row(s) but leaves `status='left'` — DISTINCT from **Restore** (which also reactivates). Such a worker appears on neither the grid nor the Leavers list; worker/booking/event history is preserved.

**Deliberately NOT built:** shift-requirements roster CRUD.

## User preferences

- The user-provided `schema.sql` must be used exactly — EXCEPT the deliberate, user-requested `workers.do_not_book BOOLEAN NOT NULL DEFAULT false` column (kept in sync in `attached_assets/extracted_files/schema.sql`). Do not make further schema deviations without an explicit request.
- Phase 2 integrations (Vincere, MS Graph, Twilio) are stubs only for now.

## Gotchas

- `connect-pg-simple`'s `createTableIfMissing` does NOT work under the esbuild bundle (it reads `table.sql` relative to the package, which isn't bundled). The `session` table must be created manually in the DB; do not rely on auto-create.
- After any `lib/*` change, run `pnpm run typecheck:libs` before leaf typechecks, or stale lib declarations cause phantom "missing export" errors.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
