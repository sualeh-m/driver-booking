import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, bookingsTable, auditLogTable, workersTable } from "@workspace/db";
import { UpsertBookingBody, DeleteBookingParams } from "@workspace/api-zod";
import { maxAllowedConsecutiveDays } from "@workspace/rest-rules";
import { serializeBooking } from "../lib/serialize";
import { getUserId } from "../lib/auth";
import { evaluateRestRule } from "../lib/restCheck";

function describe(status: string, startTime: string | null): string {
  return startTime ? `${status} @ ${startTime.slice(0, 5)}` : status;
}

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

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.workerId, workerId),
          eq(bookingsTable.shiftDate, shiftDate),
        ),
      );

    if (!existing) {
      const [created] = await tx
        .insert(bookingsTable)
        .values({
          workerId,
          sheetId,
          shiftDate,
          status,
          startTime,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      await tx.insert(auditLogTable).values({
        bookingId: created.id,
        userId,
        action: "created",
        oldValue: null,
        newValue: describe(status, startTime),
      });

      // A worker's start_date is the date of their first ever booking. It only
      // ever moves earlier (a genuinely earlier booking corrects it), never
      // later — so out-of-order entry still records the true first booking.
      const [worker] = await tx
        .select({ startDate: workersTable.startDate })
        .from(workersTable)
        .where(eq(workersTable.id, workerId));
      if (worker) {
        const [{ first }] = await tx
          .select({ first: sql<string | null>`min(${bookingsTable.shiftDate})` })
          .from(bookingsTable)
          .where(eq(bookingsTable.workerId, workerId));
        if (first && (worker.startDate == null || first < worker.startDate)) {
          await tx
            .update(workersTable)
            .set({ startDate: first })
            .where(eq(workersTable.id, workerId));
        }
      }

      return created;
    }

    const [updated] = await tx
      .update(bookingsTable)
      .set({
        sheetId,
        status,
        startTime,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(bookingsTable.id, existing.id))
      .returning();

    if (existing.status !== status) {
      await tx.insert(auditLogTable).values({
        bookingId: updated.id,
        userId,
        action: "status_change",
        oldValue: existing.status,
        newValue: status,
      });
    }

    const oldTime = existing.startTime?.slice(0, 5) ?? null;
    const newTime = startTime?.slice(0, 5) ?? null;
    if (oldTime !== newTime) {
      await tx.insert(auditLogTable).values({
        bookingId: updated.id,
        userId,
        action: "time_change",
        oldValue: oldTime,
        newValue: newTime,
      });
    }

    return updated;
  });

  res.json(serializeBooking(result));
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
      oldValue: `${context} · ${describe(existing.status, existing.startTime)}`,
      newValue: null,
    });

    await tx.delete(bookingsTable).where(eq(bookingsTable.id, existing.id));
    return existing;
  });

  if (!deleted) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
