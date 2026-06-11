import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, eventsTable, workersTable } from "@workspace/db";
import {
  CreateEventBody,
  DeleteEventParams,
  ListWorkerEventsParams,
} from "@workspace/api-zod";
import { serializeEvent } from "../lib/serialize";
import { getUserId } from "../lib/auth";

// CPC and driving-test failures only make sense for HGV drivers, so they may
// not be logged against Warehouse workers. No-shows apply to anyone.
const HGV_ONLY_EVENT_TYPES = new Set(["cpc_failure", "test_failure"]);

const router: IRouter = Router();

router.post("/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getUserId(req);
  if (userId == null) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  const { workerId, eventType } = parsed.data;
  const sheetId = parsed.data.sheetId ?? null;

  const [worker] = await db
    .select({ workerType: workersTable.workerType, fullName: workersTable.fullName })
    .from(workersTable)
    .where(eq(workersTable.id, workerId));

  if (!worker) {
    res.status(400).json({ error: "Unknown worker" });
    return;
  }

  if (HGV_ONLY_EVENT_TYPES.has(eventType) && worker.workerType !== "HGV") {
    res.status(400).json({
      error: `${worker.fullName} is a ${worker.workerType} worker — CPC and test failures can only be logged against HGV workers.`,
    });
    return;
  }

  const [created] = await db
    .insert(eventsTable)
    .values({
      workerId,
      sheetId,
      eventDate: parsed.data.eventDate,
      eventType,
      notes: parsed.data.notes ?? null,
      createdBy: userId,
    })
    .returning();

  res.status(201).json(serializeEvent(created));
});

router.get("/workers/:workerId/events", async (req, res): Promise<void> => {
  const params = ListWorkerEventsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.workerId, params.data.workerId))
    .orderBy(desc(eventsTable.eventDate), desc(eventsTable.id));

  res.json(rows.map(serializeEvent));
});

router.delete("/events/:id", async (req, res): Promise<void> => {
  const params = DeleteEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(eventsTable)
    .where(eq(eventsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
