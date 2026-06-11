import { Router, type IRouter } from "express";
import { or, ilike } from "drizzle-orm";
import { db, workersTable } from "@workspace/db";
import { CreateWorkerBody, ListWorkersQueryParams } from "@workspace/api-zod";
import { serializeWorker } from "../lib/serialize";

const router: IRouter = Router();

router.get("/workers", async (req, res): Promise<void> => {
  const query = ListWorkersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const search = query.data.search?.trim();
  const rows = search
    ? await db
        .select()
        .from(workersTable)
        .where(
          or(
            ilike(workersTable.fullName, `%${search}%`),
            ilike(workersTable.phone, `%${search}%`),
            ilike(workersTable.jobRole, `%${search}%`),
          ),
        )
        .orderBy(workersTable.fullName)
    : await db.select().from(workersTable).orderBy(workersTable.fullName);

  res.json(rows.map(serializeWorker));
});

router.post("/workers", async (req, res): Promise<void> => {
  const parsed = CreateWorkerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [worker] = await db
    .insert(workersTable)
    .values({
      fullName: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      jobRole: parsed.data.jobRole ?? null,
      workerType: parsed.data.workerType,
      startDate: parsed.data.startDate ?? null,
      vincereId: parsed.data.vincereId ?? null,
    })
    .returning();

  res.status(201).json(serializeWorker(worker));
});

export default router;
