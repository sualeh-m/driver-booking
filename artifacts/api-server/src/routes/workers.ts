import { Router, type IRouter } from "express";
import { and, count, eq, or, ilike, sql } from "drizzle-orm";
import { db, workersTable, eventsTable } from "@workspace/db";
import {
  CreateWorkerBody,
  ListWorkersQueryParams,
  SetWorkerDoNotBookParams,
  SetWorkerDoNotBookBody,
} from "@workspace/api-zod";
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

// Workers flagged Do Not Book, each with their total no-show count so the
// manager can see why they were flagged. Declared before any "/workers/:id"
// param routes so the literal path wins.
router.get("/workers/do-not-book", async (_req, res): Promise<void> => {
  const noShowCount = db
    .select({
      workerId: eventsTable.workerId,
      value: count().as("no_show_count"),
    })
    .from(eventsTable)
    .where(eq(eventsTable.eventType, "no_show"))
    .groupBy(eventsTable.workerId)
    .as("no_show_count");

  const rows = await db
    .select({
      id: workersTable.id,
      fullName: workersTable.fullName,
      phone: workersTable.phone,
      jobRole: workersTable.jobRole,
      workerType: workersTable.workerType,
      doNotBook: workersTable.doNotBook,
      noShowCount: sql<number>`coalesce(${noShowCount.value}, 0)::int`,
    })
    .from(workersTable)
    .leftJoin(noShowCount, eq(noShowCount.workerId, workersTable.id))
    .where(eq(workersTable.doNotBook, true))
    .orderBy(workersTable.fullName);

  res.json(rows);
});

router.patch("/workers/:id/do-not-book", async (req, res): Promise<void> => {
  const params = SetWorkerDoNotBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SetWorkerDoNotBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [worker] = await db
    .update(workersTable)
    .set({ doNotBook: parsed.data.doNotBook })
    .where(eq(workersTable.id, params.data.id))
    .returning();

  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  res.json(serializeWorker(worker));
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
