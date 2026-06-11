import { Router, type IRouter } from "express";
import { and, count, desc, eq } from "drizzle-orm";
import { db, eventsTable, workersTable } from "@workspace/db";
import {
  CreateEventBody,
  DeleteEventParams,
  ListWorkerEventsParams,
  ClearNoShowParams,
} from "@workspace/api-zod";
import { serializeEvent } from "../lib/serialize";
import { getUserId } from "../lib/auth";
import {
  NO_SHOW_AUTO_FLAG_THRESHOLD,
  clearNoShowsForDate,
  reconcileAutoFlagAfterRemoval,
} from "../lib/noShow";

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

  // No-show backstop: once a worker hits the threshold of total logged
  // no-shows, auto-set Do Not Book. Only fires the first time it crosses the
  // line (when not already flagged); managers can still un-flag manually.
  let autoFlagged = false;
  if (eventType === "no_show") {
    const [{ value: noShowCount }] = await db
      .select({ value: count() })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.workerId, workerId),
          eq(eventsTable.eventType, "no_show"),
        ),
      );

    if (noShowCount >= NO_SHOW_AUTO_FLAG_THRESHOLD) {
      const updated = await db
        .update(workersTable)
        .set({ doNotBook: true })
        .where(
          and(
            eq(workersTable.id, workerId),
            eq(workersTable.doNotBook, false),
          ),
        )
        .returning({ id: workersTable.id });
      autoFlagged = updated.length > 0;
    }
  }

  res.status(201).json({ ...serializeEvent(created), autoFlagged });
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

  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(eventsTable)
      .where(eq(eventsTable.id, params.data.id))
      .returning();

    // Deleting a no-show directly (from the worker's Events dialog) must keep
    // the auto-flag accurate, just like clearing it from the grid does.
    if (row && row.eventType === "no_show") {
      await reconcileAutoFlagAfterRemoval(tx, row.workerId, 1);
    }

    return row;
  });

  if (!deleted) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  res.sendStatus(204);
});

router.delete(
  "/workers/:workerId/no-shows/:shiftDate",
  async (req, res): Promise<void> => {
    const params = ClearNoShowParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const result = await db.transaction((tx) =>
      clearNoShowsForDate(tx, params.data.workerId, params.data.shiftDate),
    );

    res.json(result);
  },
);

export default router;
