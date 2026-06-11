import { and, count, eq } from "drizzle-orm";
import { db, eventsTable, workersTable } from "@workspace/db";

// Backstop threshold: once a worker accumulates this many logged no-shows their
// Do Not Book flag is auto-set. Single source of truth for the count rule —
// imported by the events route's auto-flag-on logic too.
export const NO_SHOW_AUTO_FLAG_THRESHOLD = 5;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ClearNoShowResult {
  removed: number;
  autoUnflagged: boolean;
}

// Keep the no-show auto-flag honest after a removal.
//
// The ONLY automatic path to doNotBook=true is crossing UP to the threshold,
// and it only fires while the worker is not already flagged. So we mirror it
// exactly: reverse the flag only when this removal crosses the no-show count
// back DOWN from >= threshold to < threshold. A worker flagged while still
// below the threshold was therefore flagged manually, so they are never touched.
async function reconcileAutoFlag(
  tx: Tx,
  workerId: number,
  removed: number,
): Promise<boolean> {
  if (removed <= 0) return false;

  const [{ value: remaining }] = await tx
    .select({ value: count() })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.workerId, workerId),
        eq(eventsTable.eventType, "no_show"),
      ),
    );

  const before = remaining + removed;
  if (
    before >= NO_SHOW_AUTO_FLAG_THRESHOLD &&
    remaining < NO_SHOW_AUTO_FLAG_THRESHOLD
  ) {
    const reversed = await tx
      .update(workersTable)
      .set({ doNotBook: false })
      .where(
        and(eq(workersTable.id, workerId), eq(workersTable.doNotBook, true)),
      )
      .returning({ id: workersTable.id });
    return reversed.length > 0;
  }

  return false;
}

// Delete every no_show event for a worker on a date and keep the auto-flag
// accurate. A no-show must not outlive the cell it was logged on, so this runs
// whenever a booking cell is cleared or changed to any status.
export async function clearNoShowsForDate(
  tx: Tx,
  workerId: number,
  eventDate: string,
): Promise<ClearNoShowResult> {
  const deleted = await tx
    .delete(eventsTable)
    .where(
      and(
        eq(eventsTable.workerId, workerId),
        eq(eventsTable.eventType, "no_show"),
        eq(eventsTable.eventDate, eventDate),
      ),
    )
    .returning({ id: eventsTable.id });

  const autoUnflagged = await reconcileAutoFlag(tx, workerId, deleted.length);
  return { removed: deleted.length, autoUnflagged };
}

// Reconsider the auto-flag after a single no_show event is deleted directly
// (e.g. from the worker's Events dialog), so the flag stays accurate there too.
export async function reconcileAutoFlagAfterRemoval(
  tx: Tx,
  workerId: number,
  removed: number,
): Promise<boolean> {
  return reconcileAutoFlag(tx, workerId, removed);
}
