---
name: Canonical-row upsert without a unique constraint
description: How ShiftControl keeps one canonical row per logical key when the DB schema is frozen and can't gain a unique constraint.
---

# Canonical-row upsert under a frozen schema

ShiftControl's schema must match the user-provided `schema.sql` exactly (only `workers.do_not_book` is an allowed deviation). So we **cannot** add unique constraints or `INSERT ... ON CONFLICT` to enforce "one canonical row per key".

When an in-app edit must behave as a single value per logical key but the table physically allows many rows (e.g. the grid's editable per-day "Required" total backed by `shift_requirements`, which is per-role and has no unique index on `(sheet_id, req_date)`):

- **Maintain one canonical row in app code**: update the first existing row to the new value and **zero out** any extras (never delete — other tables, e.g. `submissions`, hold FKs to those rows). Insert only when none exists and the value is > 0.
- **Serialize concurrent writers with a transaction-scoped advisory lock**, not a unique constraint: `select pg_advisory_xact_lock(${intKey1}::int, hashtext(${textKey})::int)` at the top of the transaction. Auto-releases on commit/rollback. This prevents two first-writes on an empty key from both inserting and doubling a downstream `SUM(...)` aggregate.

**Why:** without this, two concurrent first-writes both see zero rows and both insert; the grid reads `SUM(quantity_needed)` so the total silently doubles. A unique constraint would be the normal fix but is disallowed by the frozen-schema preference.

**How to apply:** any time you add an in-app "single editable value" over a table that can hold duplicates and is summed/aggregated elsewhere — reach for the advisory-lock + zero-extras pattern rather than a schema constraint.
