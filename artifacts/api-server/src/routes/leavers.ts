import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, workersTable, leaversTable } from "@workspace/db";
import {
  MarkWorkerAsLeaverParams,
  MarkWorkerAsLeaverBody,
  RestoreWorkerParams,
  DeleteLeaverRecordParams,
} from "@workspace/api-zod";
import { serializeWorker } from "../lib/serialize";
import { getUserId, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// Whole-day difference between two yyyy-MM-dd strings (leave - start). Returns
// null when there is no start date (worker never had a booking → "not started").
function serviceDays(
  startDate: string | null,
  leaveDate: string,
): number | null {
  if (!startDate) return null;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const leave = Date.parse(`${leaveDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(leave)) return null;
  return Math.max(0, Math.round((leave - start) / 86_400_000));
}

// List current leavers (workers whose status is "left"), each joined to their
// most recent leaver record for the reason / leave date / notes.
router.get("/leavers", async (_req, res): Promise<void> => {
  const latest = db
    .select({
      workerId: leaversTable.workerId,
      maxId: sql<number>`max(${leaversTable.id})`.as("max_id"),
    })
    .from(leaversTable)
    .groupBy(leaversTable.workerId)
    .as("latest");

  const rows = await db
    .select({
      workerId: workersTable.id,
      fullName: workersTable.fullName,
      jobRole: workersTable.jobRole,
      workerType: workersTable.workerType,
      startDate: workersTable.startDate,
      leaveDate: leaversTable.leaveDate,
      reason: leaversTable.reason,
      notes: leaversTable.notes,
    })
    .from(workersTable)
    .innerJoin(latest, eq(latest.workerId, workersTable.id))
    .innerJoin(leaversTable, eq(leaversTable.id, latest.maxId))
    .where(eq(workersTable.status, "left"))
    .orderBy(desc(leaversTable.leaveDate));

  res.json(
    rows.map((r) => ({
      workerId: r.workerId,
      fullName: r.fullName,
      jobRole: r.jobRole,
      workerType: r.workerType,
      startDate: r.startDate,
      leaveDate: r.leaveDate,
      reason: r.reason,
      notes: r.notes,
      serviceDays: serviceDays(r.startDate, r.leaveDate),
    })),
  );
});

// Mark a worker as having left: record a leaver row and set status to "left"
// (which removes them from the bookable grid).
router.post("/workers/:id/leave", async (req, res): Promise<void> => {
  const params = MarkWorkerAsLeaverParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = MarkWorkerAsLeaverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getUserId(req);

  const worker = await db.transaction(async (tx) => {
    const [w] = await tx
      .select()
      .from(workersTable)
      .where(eq(workersTable.id, params.data.id));
    if (!w) return null;
    // Idempotency guard: a worker already marked "left" must not be re-marked
    // (would create a duplicate leaver row). Signal back with a sentinel.
    if (w.status === "left") return "already_left" as const;

    await tx.insert(leaversTable).values({
      workerId: w.id,
      leaveDate: parsed.data.leaveDate,
      reason: parsed.data.reason,
      notes: parsed.data.notes?.trim() || null,
      createdBy: userId ?? null,
    });

    const [updated] = await tx
      .update(workersTable)
      .set({ status: "left" })
      .where(eq(workersTable.id, w.id))
      .returning();

    return updated;
  });

  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  if (worker === "already_left") {
    res.status(409).json({ error: "Worker is already marked as a leaver" });
    return;
  }

  res.json(serializeWorker(worker));
});

// Restore a leaver to active/bookable. This reverses a mistaken leave, so the
// leaver records are removed to keep retention data clean.
router.post("/workers/:id/restore", async (req, res): Promise<void> => {
  const params = RestoreWorkerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const worker = await db.transaction(async (tx) => {
    const [w] = await tx
      .select()
      .from(workersTable)
      .where(eq(workersTable.id, params.data.id));
    if (!w) return null;

    await tx.delete(leaversTable).where(eq(leaversTable.workerId, w.id));

    const [updated] = await tx
      .update(workersTable)
      .set({ status: "active" })
      .where(eq(workersTable.id, w.id))
      .returning();

    return updated;
  });

  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  res.json(serializeWorker(worker));
});

// Admin only. Permanently delete a worker's leaver record(s). Unlike Restore,
// this does NOT reactivate the worker (they stay "left" and off the grid) — it
// purges the leaver entry from retention tracking. requireAdmin is attached
// per-route so the admin gate does not leak onto other routes in this router.
router.delete(
  "/leavers/:workerId",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteLeaverRecordParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const deleted = await db
      .delete(leaversTable)
      .where(eq(leaversTable.workerId, params.data.workerId))
      .returning({ id: leaversTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Leaver record not found" });
      return;
    }

    res.status(204).end();
  },
);

export default router;
