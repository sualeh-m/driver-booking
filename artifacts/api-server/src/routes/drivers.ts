import { Router, type IRouter } from "express";
import { or, ilike } from "drizzle-orm";
import { db, driversTable } from "@workspace/db";
import { CreateDriverBody, ListDriversQueryParams } from "@workspace/api-zod";
import { serializeDriver } from "../lib/serialize";

const router: IRouter = Router();

router.get("/drivers", async (req, res): Promise<void> => {
  const query = ListDriversQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const search = query.data.search?.trim();
  const rows = search
    ? await db
        .select()
        .from(driversTable)
        .where(
          or(
            ilike(driversTable.fullName, `%${search}%`),
            ilike(driversTable.phone, `%${search}%`),
            ilike(driversTable.jobRole, `%${search}%`),
          ),
        )
        .orderBy(driversTable.fullName)
    : await db.select().from(driversTable).orderBy(driversTable.fullName);

  res.json(rows.map(serializeDriver));
});

router.post("/drivers", async (req, res): Promise<void> => {
  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [driver] = await db
    .insert(driversTable)
    .values({
      fullName: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      jobRole: parsed.data.jobRole ?? null,
      notes: parsed.data.notes ?? null,
      vincereId: parsed.data.vincereId ?? null,
    })
    .returning();

  res.status(201).json(serializeDriver(driver));
});

export default router;
