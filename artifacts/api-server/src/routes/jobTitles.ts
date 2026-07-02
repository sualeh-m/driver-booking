import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, customJobTitlesTable } from "@workspace/db";

const router: IRouter = Router();

// Remembered custom job titles (for the "Other" role), alphabetical. The
// client filters these live as the user types.
router.get("/job-titles", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ title: customJobTitlesTable.title })
    .from(customJobTitlesTable)
    .orderBy(sql`lower(${customJobTitlesTable.title})`);

  res.json(rows.map((r) => r.title));
});

export default router;
