---
name: Auth model and admin-only delete semantics
description: How ShiftControl email/password auth + roles are wired, and the deliberate semantics of the admin-only destructive deletes (worker, sheet, leaver record, submission) plus the shared type-DELETE confirm pattern.
---

# Auth model (email/password + roles)

- Auth is email + password (scrypt, no external dep) with two roles: `admin` and `standard`. There are NO email/invite flows — an admin sets a temporary password and the user is forced to change it on first login (`must_change_password`).
- Authorization is enforced **server-side**, never UI-only. Admin-only routes attach `requireAdmin` **per-route**, NOT via `router.use(...)`.
  - **Why:** a router mounted at the app root with `router.use(requireAdmin)` leaks the admin gate onto every router registered after it (Express runs root-level middleware in registration order across routers). This caused a real bug where standard users were 403'd from `/sheets`.
  - **How to apply:** when adding any admin-only endpoint, write `router.method(path, requireAdmin, handler)`. Do not gate a whole router with `use`.

# Admin-only destructive deletes

Several destructive actions are admin-only (server-enforced + UI hidden for standard users via `useGetCurrentUser().role === 'admin'`). Hard-delete is DISTINCT from "mark as leaver": a hard-deleted entity must vanish from KPI reports, whereas a leaver stays in retention/leaver metrics.

## Shared type-DELETE confirm + KPI invalidation pattern
- All friction-gated deletes use one reusable `ConfirmDeleteDialog` (types the literal `DELETE` exactly — no trim; input resets on open; destructive button disabled until exact match) with a per-call impact ReactNode.
- **Impact counts come from dedicated read endpoints**, not guesses: `GET /workers/:id/delete-impact` (bookings/submissions/events/workerSheets/messages/hasLeaverRecord) and `GET /sheets/:sheetId/delete-impact` (bookings/workers/contacts/requirements/submissions). Both are admin-only per-route.
- **KPI exclusion is via query invalidation:** after any delete that changes report inputs, invalidate the reports query keys by prefix — `queryClient.invalidateQueries({ queryKey: ["/api/reports/operational"] })` and/or `["/api/reports/people"]` (prefix match covers all param variants). Worker/sheet delete invalidate both; submission + leaver-record delete invalidate `people` only.
- **Booking cell-clear is deliberately NOT gated** (no type-DELETE friction) — it is core grid editing available to any logged-in user; clearing a cell already deletes the booking row.

## Delete a worker (hard delete)
- `DELETE /workers/:id` (admin per-route) removes the worker; FK cascades wipe bookings, submissions, workerSheets, events, leavers, messages; `audit_log.booking_id` is SET NULL. Returns 204, then 404 on repeat. This is the "purge entirely" path, distinct from Mark-as-Leaver (which keeps the worker for retention KPIs).

## Delete a submission
- `DELETE /submissions/:id` (admin per-route): plain admin-only row delete with 404 handling. Surfaced as a per-row admin-only trash column on the Submissions page (colSpan accounts for the extra column when admin).

## Delete a whole sheet (+ its bookings)
- `bookings.sheet_id` is `ON DELETE RESTRICT`, so the delete handler must remove the sheet's bookings **inside the same txn** before deleting the sheet. Everything else is automatic: `sheet_contacts` / `worker_sheets` / `shift_requirements` cascade; `submissions.sheet_id`, `events.sheet_id`, `submissions.requirement_id`, and `audit_log.booking_id` are `SET NULL`.
- **Why:** the schema is frozen (no unique/cascade changes allowed beyond the one approved `do_not_book` column), so the RESTRICT must be handled in app code, not by altering the FK.

## Delete a leaver record (distinct from Restore)
- **Restore** (`POST /workers/:id/restore`) reactivates the worker: deletes leaver rows AND sets `status='active'` → back on the grid.
- **Delete leaver record** (`DELETE /leavers/:workerId`, admin-only) deletes the worker's leaver row(s) but leaves `status='left'` — purges the retention/leaver-list entry WITHOUT bringing them back to the grid.
- **Consequence (accepted by design):** a worker left this way is `status='left'` with no leaver row, so they appear on neither the grid nor the Leavers list. This is the intended "purge from leaver tracking" behavior, kept deliberately separate from Restore. Worker/booking/event history is preserved.
