import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, shiftRequirementsTable } from "@workspace/db";
import { ListRequirementsQueryParams } from "@workspace/api-zod";

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

export default router;
