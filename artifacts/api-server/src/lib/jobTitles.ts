import { customJobTitlesTable } from "@workspace/db";

// The custom-title rule lives in ONE place: a title is REQUIRED (non-blank)
// when the job role is "Other" and forced null for every other role, so a
// role change away from "Other" always clears the stale title.
export function resolveCustomJobTitle(
  jobRole: string | null,
  customJobTitle: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (jobRole !== "Other") return { ok: true, value: null };
  const trimmed = (customJobTitle ?? "").trim();
  if (trimmed === "") {
    return {
      ok: false,
      error: 'A job title is required when the job role is "Other"',
    };
  }
  return { ok: true, value: trimmed };
}

type TitleWriter = {
  insert: typeof import("@workspace/db").db.insert;
};

// Remember a typed title in the suggestion list. Dedupe is case-insensitive
// via the unique index on lower(title) — the first-typed casing is kept, so
// "recovery driver" typed later never duplicates "Recovery Driver".
export async function rememberJobTitle(
  executor: TitleWriter,
  title: string | null,
): Promise<void> {
  if (!title) return;
  await executor
    .insert(customJobTitlesTable)
    .values({ title })
    .onConflictDoNothing();
}
