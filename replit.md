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

- DB schema (source of truth): `lib/db/src/schema/*.ts` — mirrors the user-provided v2 `attached_assets/extracted_files/schema.sql` exactly. Active tables: users, sheets, sheetContacts, workers, workerSheets, bookings, auditLog, messages, events, leavers. Empty-by-design tables exist but are NOT wired up: shiftRequirements, submissions. `session` is infra (provisioned via Drizzle, see Gotchas).
- API contract (source of truth): `lib/api-spec/openapi.yaml` — drives codegen (React Query hooks + Zod schemas in `@workspace/api-client-react`).
- Backend routes: `artifacts/api-server/src/routes/*.ts`; helpers in `artifacts/api-server/src/lib/` (serialize, auth, session, csv, dates); wiring in `src/app.ts`.
- Frontend: `artifacts/driver-grid/src/` — grid in `components/grid/BookingGrid.tsx`, layout in `components/layout/Shell.tsx`.
- Rest-day rule (shared): `lib/rest-rules/src/index.ts` — single source of truth for thresholds (`REST_DAY_RULES`) and the consecutive-working-day logic used by both the server (enforcement in `bookings.ts`, counters in `grid.ts`) and the frontend.

## Architecture decisions

- Contract-first: OpenAPI spec generates client hooks and Zod validators; serialize.ts converts `Date → ISO string` because generated Zod expects strings (DB date cols use Drizzle `mode: "string"`).
- Auth is pick-your-name (no passwords): session cookie via `express-session` + `connect-pg-simple`. Same-origin, so cookies auto-send. Mutations read `req.session.userId` for the audit trail.
- A "working shift" = a booking with `startTime` set; per-day totals count these.
- Client-email and send-confirmation endpoints compute real previews server-side; actual sending (Vincere / MS Graph / Twilio) is deferred to Phase 2 stubs.

## Product

Spreadsheet-style grid (workers down, dates across) scoped to the selected **sheet**, with Day/Week/Month toggle (Week = Sun–Sat, Month from 1st), inline status + 24h start-time editing, colour-coded status cells, per-worker standing note column (from `workerSheets.notes`), and per-day working-shift totals. Statuses + colours: Available=orange, Pre-Booked=yellow, Confirmed=green, Rest=grey, Off=white, Holiday=black with a white ✕. Top actions: Add Worker (creates worker with sheet's worker type + links with a standing note), New Sheet (name, client company, depot, worker type HGV/Warehouse), Sheet Settings (manage multiple client contacts, one primary), Import CSV, Export CSV (client-side), Email-to-client preview (uses the sheet's primary contact), Send-confirmations preview. Pick-your-name login, full audit trail, Activity view.

**HGV rest-day safety check (built):** for HGV workers only, the grid shows a per-day counter (white pill, top-right of each cell) of consecutive working days (Confirmed/Pre-Booked count; Rest/Off/Holiday reset). When booking an HGV worker into a working status: at the warn threshold (6) it warns but allows with a confirmation dialog ("Book anyway"); at the block threshold (7) it is blocked server-side (cannot save). Warehouse workers have no limit and no counter. Thresholds live in ONE place: `REST_DAY_RULES` in `@workspace/rest-rules` (default warn=6, block=7).

**Worker event logging (built):** from the grid, each worker row has an event trigger (icon in the worker name cell — two clicks, no separate page) opening an Events dialog to log an event (type + date defaulting to today + optional notes), view that worker's events (most-recent-first list), and delete one. Event types: No Show (`no_show`), CPC Failure (`cpc_failure`), Test Failure (`test_failure`). Hard rule enforced server-side in `routes/events.ts`: CPC/Test failures may ONLY be logged for HGV workers; Warehouse workers get only No Show. The frontend filters the type options by worker type as UX, but the server is the source of truth (returns 400 if violated). The logged event's `sheetId` is the currently selected sheet; the list shows all of a worker's events regardless of sheet.

**Do Not Book flag + No Show (built):** workers carry a `doNotBook` boolean (column added to the workers table — see preferences note on the schema deviation). Flagged workers are filtered out of the bookable grid (`grid.ts` adds `doNotBook = false` to the WHERE) and surface only in a dedicated **Do Not Book** view (`pages/DoNotBook.tsx`, nav link in Shell) listing each flagged worker with their total no-show count and an "Allow booking again" button (reversible un-flag via `PATCH /workers/{id}/do-not-book`). The booking cell's status dropdown has a red **No Show** option (sentinel value, not a booking status) that logs a `no_show` event for that date via `POST /events` — a single no-show does NOT remove the worker. Backstop in `routes/events.ts`: once a worker accumulates 5 total `no_show` events, `doNotBook` is auto-set to true (only crosses the line once, still manually reversible); the create response carries `autoFlagged` so the UI can explain the removal. CPC/Test failure logging is unchanged (HGV only). The worker-name cell (no warning icon) is itself the click target to open the Events dialog. **Display:** a date with a logged `no_show` event renders that grid cell with a red background and white "No Show" text (overriding any booking appearance), so it is immediately obvious; this is read from events data (the grid response includes a `noShows` array of `{workerId, shiftDate}` for the visible window) so it persists after refresh. A red "No Show" entry is in the grid colour key.

**Leaver tracking (built):** workers carry a `startDate` (date col) and a `status` ('active'/'left'). `startDate` = the worker's first-ever booking date, set automatically on the booking write paths (`bookings.ts` PUT and `grid.ts` CSV import). It only ever moves EARLIER — a genuinely earlier booking (out-of-order entry or import) corrects it; later bookings and deletes never move it forward. A worker with no bookings has `startDate = null` → length of service renders as "Not started" (never zero/error). Mark-as-leaver: from a worker's Events dialog, a **Mark as leaver** button opens `MarkLeaverDialog` (leave date defaulting to today, a reason from the EXACT dropdown, optional notes) → `POST /workers/{id}/leave` inserts a `leavers` row and sets `status='left'` in one txn. Reasons live in ONE place — the `LeaverReason` enum in the OpenAPI spec (`low_rates`, `travel_distance`, `permanent_employment`, `shift_pattern`, `performance_issues`, `attendance_issues`, `other`); the same set is a CHECK constraint on `leavers.reason` (DB is the source of truth) and a human-label map (`LEAVER_REASON_LABELS`) in `pages/Leavers.tsx`. Marked leavers drop off the bookable grid (`grid.ts` WHERE adds `status='active'`) and surface only in a dedicated **Leavers** view (`pages/Leavers.tsx`, nav link in Shell) listing each leaver with leave date, reason label, and length of service (`startDate`→`leaveDate` whole days via `GET /leavers`' computed `serviceDays`; "Not started" when null). Reversible **Restore** (`POST /workers/{id}/restore`) deletes that worker's leaver rows and sets `status='active'`, returning them to the grid — restore is treated as a mistake-reversal (the `leavers` table is not retention history).

Deliberately NOT built (tables exist but stay empty): KPI/reporting dashboard, shift-requirements roster, submissions.

## User preferences

- The user-provided `schema.sql` must be used exactly — EXCEPT the deliberate, user-requested `workers.do_not_book BOOLEAN NOT NULL DEFAULT false` column (kept in sync in `attached_assets/extracted_files/schema.sql`). Do not make further schema deviations without an explicit request.
- Phase 2 integrations (Vincere, MS Graph, Twilio) are stubs only for now.

## Gotchas

- `connect-pg-simple`'s `createTableIfMissing` does NOT work under the esbuild bundle (it reads `table.sql` relative to the package, which isn't bundled). The `session` table must be created manually in the DB; do not rely on auto-create.
- After any `lib/*` change, run `pnpm run typecheck:libs` before leaf typechecks, or stale lib declarations cause phantom "missing export" errors.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
