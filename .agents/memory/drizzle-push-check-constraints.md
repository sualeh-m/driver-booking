---
name: drizzle-kit push ignores CHECK constraints
description: Why a changed CHECK constraint silently doesn't reach the dev DB via push, and how to apply it.
---

`pnpm --filter @workspace/db run push` (drizzle-kit push) does NOT diff or apply
changes to SQL `CHECK` constraints. After editing a `check(...)` in a Drizzle
schema, push reports "No changes detected" and the old constraint stays live in
the DB — so an INSERT/UPDATE with a newly-allowed value still fails.

**Why:** drizzle-kit's introspection/diff doesn't track check-constraint
expressions (only columns, types, defaults, FKs, indexes/unique).

**How to apply:** after any `check()` change, run the ALTER manually against the
dev DB (idempotent drop+recreate), then verify with
`pg_get_constraintdef`:

```sql
ALTER TABLE <t> DROP CONSTRAINT IF EXISTS <name>;
ALTER TABLE <t> ADD CONSTRAINT <name> CHECK (<new expr>);
```

The same ALTER must be handed to the user for the prod DB (no prod write
access from here). Drizzle `mode`-agnostic data migrations (e.g. remapping
free-text columns to a new fixed enum) likewise must be run as explicit SQL —
push won't do them.
