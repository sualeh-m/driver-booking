---
name: Auth model and admin-only delete semantics
description: How ShiftControl email/password auth + roles are wired, and the deliberate semantics of the two admin-only destructive deletes (sheet, leaver record).
---

# Auth model (email/password + roles)

- Auth is email + password (scrypt, no external dep) with two roles: `admin` and `standard`. There are NO email/invite flows — an admin sets a temporary password and the user is forced to change it on first login (`must_change_password`).
- Authorization is enforced **server-side**, never UI-only. Admin-only routes attach `requireAdmin` **per-route**, NOT via `router.use(...)`.
  - **Why:** a router mounted at the app root with `router.use(requireAdmin)` leaks the admin gate onto every router registered after it (Express runs root-level middleware in registration order across routers). This caused a real bug where standard users were 403'd from `/sheets`.
  - **How to apply:** when adding any admin-only endpoint, write `router.method(path, requireAdmin, handler)`. Do not gate a whole router with `use`.

# Admin-only destructive deletes

Two destructive actions are admin-only (server-enforced + UI hidden for standard users via `useGetCurrentUser().role === 'admin'`):

## Delete a whole sheet (+ its bookings)
- `bookings.sheet_id` is `ON DELETE RESTRICT`, so the delete handler must remove the sheet's bookings **inside the same txn** before deleting the sheet. Everything else is automatic: `sheet_contacts` / `worker_sheets` / `shift_requirements` cascade; `submissions.sheet_id`, `events.sheet_id`, `submissions.requirement_id`, and `audit_log.booking_id` are `SET NULL`.
- **Why:** the schema is frozen (no unique/cascade changes allowed beyond the one approved `do_not_book` column), so the RESTRICT must be handled in app code, not by altering the FK.

## Delete a leaver record (distinct from Restore)
- **Restore** (`POST /workers/:id/restore`) reactivates the worker: deletes leaver rows AND sets `status='active'` → back on the grid.
- **Delete leaver record** (`DELETE /leavers/:workerId`, admin-only) deletes the worker's leaver row(s) but leaves `status='left'` — purges the retention/leaver-list entry WITHOUT bringing them back to the grid.
- **Consequence (accepted by design):** a worker left this way is `status='left'` with no leaver row, so they appear on neither the grid nor the Leavers list. This is the intended "purge from leaver tracking" behavior, kept deliberately separate from Restore. Worker/booking/event history is preserved.
