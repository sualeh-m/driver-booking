import { Router, type IRouter } from "express";
import { and, count, eq, or, ilike, sql } from "drizzle-orm";
import { db, workersTable, eventsTable, workerSheetsTable } from "@workspace/db";
import {
  CreateWorkerBody,
  ListWorkersQueryParams,
  SetWorkerDoNotBookParams,
  SetWorkerDoNotBookBody,
  GetWorkerParams,
  UpdateWorkerParams,
  UpdateWorkerBody,
} from "@workspace/api-zod";
import { serializeWorker } from "../lib/serialize";

// Normalise an optional free-text field: trim, and treat empty as null so we
// never store blank strings.
function cleanText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

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

// Single worker by id. Registered after the literal "/workers/do-not-book"
// route so that path is not captured by ":id".
router.get("/workers/:id", async (req, res): Promise<void> => {
  const params = GetWorkerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [worker] = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.id, params.data.id));

  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  res.json(serializeWorker(worker));
});

// Update a worker's editable details. start_date is auto-derived from the
// worker's first booking and is deliberately NOT accepted here. Changing
// worker_type needs no extra reconciliation: the HGV rest-day rule and the
// HGV-only event check both read workers.worker_type live, so they follow the
// new value automatically. When a sheetId is supplied the standing note for
// that worker+sheet is updated in the same transaction.
router.patch("/workers/:id", async (req, res): Promise<void> => {
  const params = UpdateWorkerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateWorkerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fullName, phone, jobRole, workerType, note, sheetId } = parsed.data;

  try {
    const worker = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(workersTable)
        .set({
          fullName: fullName.trim(),
          phone: cleanText(phone),
          jobRole: cleanText(jobRole),
          workerType,
        })
        .where(eq(workersTable.id, params.data.id))
        .returning();

      if (!updated) return null;

      // Standing notes live per worker+sheet. Only touch the link the editor
      // is looking at; if the worker isn't linked to that sheet this is a no-op.
      if (sheetId !== undefined) {
        await tx
          .update(workerSheetsTable)
          .set({ notes: cleanText(note) })
          .where(
            and(
              eq(workerSheetsTable.workerId, params.data.id),
              eq(workerSheetsTable.sheetId, sheetId),
            ),
          );
      }

      return updated;
    });

    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    res.json(serializeWorker(worker));
  } catch {
    res.status(500).json({ error: "Failed to update worker" });
  }
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
