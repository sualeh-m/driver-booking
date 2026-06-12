import { and, eq, sql } from "drizzle-orm";
import { db, bookingsTable, auditLogTable, workersTable } from "@workspace/db";
import { clearNoShowsForDate } from "./noShow";

// The transaction handle passed to db.transaction's callback. Typing it as
// `typeof db` keeps the shared query surface and matches how restCheck consumes
// either the base connection or an open transaction.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function describeBooking(status: string, startTime: string | null): string {
  return startTime ? `${status} @ ${startTime.slice(0, 5)}` : status;
}

export interface ApplyBookingParams {
  workerId: number;
  sheetId: number;
  shiftDate: string;
  status: string;
  startTime: string | null;
}

// Single source of the per-cell upsert: insert-or-update the booking, write the
// matching audit entry, keep the worker's start_date at their earliest booking,
// and clear any logged no-show on that cell. Shared by the single-cell PUT and
// the drag-fill batch so every saved cell behaves identically. Must run inside
// a transaction.
export async function applyBookingTx(
  tx: Tx,
  params: ApplyBookingParams,
  userId: number,
) {
  const { workerId, sheetId, shiftDate, status, startTime } = params;

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
      newValue: describeBooking(status, startTime),
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

    // A no-show must not outlive its cell: setting any status on this
    // worker+date clears a previously logged no-show (keeps the flag honest).
    await clearNoShowsForDate(tx, workerId, shiftDate);

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

  // A no-show must not outlive its cell: changing this worker+date to any
  // status clears a previously logged no-show (keeps the flag honest).
  await clearNoShowsForDate(tx, workerId, shiftDate);

  return updated;
}
