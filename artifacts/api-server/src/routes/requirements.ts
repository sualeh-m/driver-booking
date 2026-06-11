import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, shiftRequirementsTable } from "@workspace/db";
import {
  ListRequirementsQueryParams,
  UpsertDailyRequirementBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// List shift requirements (read-only). The requirements roster itself is not
// managed in this app yet; this endpoint exists so submissions can be linked to
// an existing client need. Optionally restrict to a single sheet.
router.get("/requirements", async (req, res): Promise<void> => {
  const query = ListRequirementsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { sheetId } = query.data;

  const rows = sheetId
    ? await db
        .select()
        .from(shiftRequirementsTable)
        .where(eq(shiftRequirementsTable.sheetId, sheetId))
        .orderBy(asc(shiftRequirementsTable.reqDate))
    : await db
        .select()
        .from(shiftRequirementsTable)
        .orderBy(asc(shiftRequirementsTable.reqDate));

  res.json(
    rows.map((r) => ({
      id: r.id,
      sheetId: r.sheetId,
      reqDate: r.reqDate,
      jobRole: r.jobRole,
      quantityNeeded: r.quantityNeeded,
    })),
  );
});

// Set the total workers required for a sheet on a date (the grid's editable
// "Required" row). Roster CRUD by role isn't managed in-app, so we keep a
// single canonical requirement row per sheet+date: update the first existing
// row to the entered total and zero out any extras so the grid sum matches the
// entered value exactly. Extras are zeroed (not deleted) to preserve any
// submission rows that reference them.
router.put("/requirements/daily", async (req, res): Promise<void> => {
  const parsed = UpsertDailyRequirementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { sheetId, shiftDate } = parsed.data;
  // Zod from the spec only guarantees number >= 0; coerce to a whole count.
  const required = Math.trunc(parsed.data.required);

  await db.transaction(async (tx) => {
    // Serialize concurrent upserts for the same sheet+date so two requests on a
    // previously empty day can't both insert (which would double the SUM the
    // grid reads). Transaction-scoped lock auto-releases on commit/rollback.
    await tx.execute(
      sql`select pg_advisory_xact_lock(${sheetId}::int, hashtext(${shiftDate})::int)`,
    );

    const existing = await tx
      .select({ id: shiftRequirementsTable.id })
      .from(shiftRequirementsTable)
      .where(
        and(
          eq(shiftRequirementsTable.sheetId, sheetId),
          eq(shiftRequirementsTable.reqDate, shiftDate),
        ),
      )
      .orderBy(asc(shiftRequirementsTable.id));

    if (existing.length === 0) {
      if (required > 0) {
        await tx.insert(shiftRequirementsTable).values({
          sheetId,
          reqDate: shiftDate,
          jobRole: null,
          quantityNeeded: required,
        });
      }
      return;
    }

    // Update the first row to the entered total; zero any extras so the sum
    // shown in the grid equals what the user typed.
    await tx
      .update(shiftRequirementsTable)
      .set({ quantityNeeded: required })
      .where(eq(shiftRequirementsTable.id, existing[0].id));

    for (const extra of existing.slice(1)) {
      await tx
        .update(shiftRequirementsTable)
        .set({ quantityNeeded: 0 })
        .where(eq(shiftRequirementsTable.id, extra.id));
    }
  });

  res.json({ shiftDate, required });
});

export default router;
