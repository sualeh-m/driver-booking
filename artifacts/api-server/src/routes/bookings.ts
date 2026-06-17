import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, bookingsTable, auditLogTable, workersTable } from "@workspace/db";
import {
  UpsertBookingBody,
  UpsertBookingsBatchBody,
  DeleteBookingParams,
} from "@workspace/api-zod";
import { maxAllowedConsecutiveDays } from "@workspace/rest-rules";
import { serializeBooking } from "../lib/serialize";
import { getUserId } from "../lib/auth";
import { evaluateRestRule, evaluateRestBatchForWorker } from "../lib/restCheck";
import { clearNoShowsForDate } from "../lib/noShow";
import { applyBookingTx, describeBooking } from "../lib/applyBooking";

const router: IRouter = Router();

router.put("/bookings", async (req, res): Promise<void> => {
  const parsed = UpsertBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getUserId(req);
  if (userId == null) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  const { workerId, sheetId, shiftDate, status } = parsed.data;
  const startTime = parsed.data.startTime ?? null;
  const note = parsed.data.note?.trim() || null;
  const acknowledgeRestWarning = parsed.data.acknowledgeRestWarning === true;

  // HGV rest-day safety check — Warehouse workers are never limited.
  const rest = await evaluateRestRule(db, workerId, shiftDate, status);
  if (rest.applies) {
    if (rest.decision === "block") {
      res.status(422).json({
        code: "REST_BLOCK",
        consecutiveDays: rest.consecutiveDays,
        error: `Cannot book ${rest.workerName}: this would be ${rest.consecutiveDays} consecutive working days for an HGV worker. The maximum is ${maxAllowedConsecutiveDays()}. Add a Rest, Off or Holiday day to break the run first.`,
      });
      return;
    }

    if (rest.decision === "warn" && !acknowledgeRestWarning) {
      res.status(409).json({
        code: "REST_WARNING",
        consecutiveDays: rest.consecutiveDays,
        error: `This will be ${rest.consecutiveDays} consecutive working days for ${rest.workerName} (HGV), with no rest day. Are you sure you want to book this shift?`,
      });
      return;
    }
  }

  const result = await db.transaction((tx) =>
    applyBookingTx(tx, { workerId, sheetId, shiftDate, status, startTime, note }, userId),
  );

  res.json(serializeBooking(result));
});

router.put("/bookings/batch", async (req, res): Promise<void> => {
  const parsed = UpsertBookingsBatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getUserId(req);
  if (userId == null) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  const { sheetId, status, cells } = parsed.data;
  const startTime = parsed.data.startTime ?? null;
  const note = parsed.data.note?.trim() || null;
  const acknowledgeRestWarning = parsed.data.acknowledgeRestWarning === true;

  // Group the selected cells by worker so the rest-day rule can be evaluated
  // per worker, in ascending date order, exactly like single-cell editing.
  const datesByWorker = new Map<number, string[]>();
  for (const cell of cells) {
    const list = datesByWorker.get(cell.workerId) ?? [];
    list.push(cell.shiftDate);
    datesByWorker.set(cell.workerId, list);
  }

  type ResultCell = {
    workerId: number;
    shiftDate: string;
    workerName: string;
    consecutiveDays: number;
  };
  const applied: ResultCell[] = [];
  const warnings: ResultCell[] = [];
  const blocked: ResultCell[] = [];

  await db.transaction(async (tx) => {
    for (const [workerId, dates] of datesByWorker) {
      const { workerName, perDate } = await evaluateRestBatchForWorker(
        tx,
        workerId,
        dates,
        status,
      );

      // Apply in ascending date order so accumulated state matches the
      // per-cell classification (which assumed the same order).
      const ordered = [...new Set(dates)].sort();
      for (const shiftDate of ordered) {
        const decision = perDate.get(shiftDate);
        const consecutiveDays = decision?.consecutiveDays ?? 0;
        const cell: ResultCell = { workerId, shiftDate, workerName, consecutiveDays };

        if (decision?.decision === "block") {
          blocked.push(cell);
          continue;
        }
        if (decision?.decision === "warn" && !acknowledgeRestWarning) {
          warnings.push(cell);
          continue;
        }

        await applyBookingTx(
          tx,
          { workerId, sheetId, shiftDate, status, startTime, note },
          userId,
        );
        applied.push(cell);
      }
    }
  });

  res.json({ applied, warnings, blocked });
});

router.delete("/bookings/:id", async (req, res): Promise<void> => {
  const params = DeleteBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = getUserId(req);
  if (userId == null) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  const deleted = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, params.data.id));

    if (!existing) return null;

    // The audit_log FK is ON DELETE SET NULL, so once the booking row is gone
    // the worker name and shift date can no longer be derived via joins. Embed
    // that context into the audit value so the deletion stays self-describing.
    const [worker] = await tx
      .select({ fullName: workersTable.fullName })
      .from(workersTable)
      .where(eq(workersTable.id, existing.workerId));

    const context = `${worker?.fullName ?? `Worker #${existing.workerId}`} · ${existing.shiftDate}`;

    await tx.insert(auditLogTable).values({
      bookingId: existing.id,
      userId,
      action: "deleted",
      oldValue: `${context} · ${describeBooking(existing.status, existing.startTime)}`,
      newValue: null,
    });

    await tx.delete(bookingsTable).where(eq(bookingsTable.id, existing.id));

    // Clearing the cell also clears any no-show logged on it, so the red
    // "No Show" never persists after the booking is gone.
    await clearNoShowsForDate(tx, existing.workerId, existing.shiftDate);

    return existing;
  });

  if (!deleted) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
