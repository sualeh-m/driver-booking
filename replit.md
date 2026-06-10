# ShiftControl

Internal HGV driver shift-booking app for a recruitment agency — a spreadsheet-style editable grid (drivers × dates) that replaces the team's Google Sheets workflow.

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

- DB schema (source of truth): `lib/db/src/schema/*.ts` — mirrors the user-provided `attached_assets/extracted_files/schema.sql` exactly (7 tables: users, contracts, drivers, driverContracts, bookings, auditLog, messages).
- API contract (source of truth): `lib/api-spec/openapi.yaml` — drives codegen (React Query hooks + Zod schemas in `@workspace/api-client-react`).
- Backend routes: `artifacts/api-server/src/routes/*.ts`; helpers in `artifacts/api-server/src/lib/` (serialize, auth, session, csv, dates); wiring in `src/app.ts`.
- Frontend: `artifacts/driver-grid/src/` — grid in `components/grid/BookingGrid.tsx`, layout in `components/layout/Shell.tsx`.

## Architecture decisions

- Contract-first: OpenAPI spec generates client hooks and Zod validators; serialize.ts converts `Date → ISO string` because generated Zod expects strings (DB date cols use Drizzle `mode: "string"`).
- Auth is pick-your-name (no passwords): session cookie via `express-session` + `connect-pg-simple`. Same-origin, so cookies auto-send. Mutations read `req.session.userId` for the audit trail.
- A "working shift" = a booking with `startTime` set; per-day totals count these.
- Client-email and send-confirmation endpoints compute real previews server-side; actual sending (Vincere / MS Graph / Twilio) is deferred to Phase 2 stubs.

## Product

Spreadsheet-style grid (drivers down, dates across) with Day/Week/Month toggle (Week = Sun–Sat, Month from 1st), contract filter, inline status + 24h start-time editing, colour-coded status cells, and per-day working-shift totals. Top actions: Add driver, New contract, Import CSV (confirm + choose contract), Export CSV (client-side), Email-to-client preview, Send-confirmations preview. Pick-your-name login, full audit trail, Activity view.

## User preferences

- The user-provided `schema.sql` must be used exactly — do not alter table/column definitions.
- Phase 2 integrations (Vincere, MS Graph, Twilio) are stubs only for now.

## Gotchas

- `connect-pg-simple`'s `createTableIfMissing` does NOT work under the esbuild bundle (it reads `table.sql` relative to the package, which isn't bundled). The `session` table must be created manually in the DB; do not rely on auto-create.
- After any `lib/*` change, run `pnpm run typecheck:libs` before leaf typechecks, or stale lib declarations cause phantom "missing export" errors.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
