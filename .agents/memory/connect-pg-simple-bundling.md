---
name: connect-pg-simple session table under esbuild
description: Why createTableIfMissing fails in bundled servers and how to provision the session table instead.
---

# connect-pg-simple `createTableIfMissing` is broken under esbuild bundling

`connect-pg-simple`'s `createTableIfMissing: true` reads `table.sql` from a path
relative to the package on disk (`dist/table.sql`). After the API server is
bundled with esbuild into a single file, that SQL file is not emitted next to the
bundle, so the option throws `ENOENT: ... dist/table.sql` at runtime and the
`session` table is never created. Symptom: login appears to succeed (Set-Cookie is
sent), but the session is never persisted, so every subsequent request is
"Not logged in".

**Fix:** do NOT rely on `createTableIfMissing`. Define the `session` table in the
Drizzle schema (sid varchar PK, sess json, expire timestamp(6), index on expire)
so `pnpm --filter @workspace/db run push` provisions it in both dev and prod. This
is infrastructure, kept separate from the user's business `schema.sql` tables.

**Why:** the bundled server has no access to the package's on-disk SQL assets;
schema-managed provisioning is the only reliable path across environments.

**How to apply:** any time a Postgres session/queue/etc. library says it will
"auto-create its table", verify whether it reads an on-disk asset — if so, provision
the table via your own migration/schema instead of trusting the auto-create flag.
