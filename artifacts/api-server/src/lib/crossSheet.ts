import { and, eq, ne } from "drizzle-orm";
import { db, bookingsTable, sheetsTable, workersTable } from "@workspace/db";
import { isWorkingStatus } from "@workspace/rest-rules";
import { sheetDisplayName } from "./serialize";

// The transaction handle passed to db.transaction's callback (or the base db).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CrossSheetConflict = {
  workerName: string;
  sheetId: number;
  sheetName: string;
  status: string;
};

// A worker holds at most ONE booking per day (the global
// `one_booking_per_worker_per_day` unique constraint). So a working booking
// (Confirmed/Pre-Booked) on a DIFFERENT sheet means the worker is already
// committed to work elsewhere that day; writing from another sheet would
// silently move/overwrite that commitment. Callers must HARD BLOCK instead.
// Returns the conflicting booking (with the other sheet's display name) or null
// when it is safe to write. Reads on the passed connection (base db or an open
// transaction). A booking on the SAME sheet is never a conflict — that's a
// normal edit — because `ne(sheetId, incomingSheetId)` excludes it.
export async function findCrossSheetWorkingConflict(
  conn: typeof db | Tx,
  workerId: number,
  shiftDate: string,
  incomingSheetId: number,
): Promise<CrossSheetConflict | null> {
  const [existing] = await conn
    .select({
      status: bookingsTable.status,
      sheetId: bookingsTable.sheetId,
      clientCompany: sheetsTable.clientCompany,
      depot: sheetsTable.depot,
      workerName: workersTable.fullName,
    })
    .from(bookingsTable)
    .innerJoin(sheetsTable, eq(sheetsTable.id, bookingsTable.sheetId))
    .innerJoin(workersTable, eq(workersTable.id, bookingsTable.workerId))
    .where(
      and(
        eq(bookingsTable.workerId, workerId),
        eq(bookingsTable.shiftDate, shiftDate),
        ne(bookingsTable.sheetId, incomingSheetId),
      ),
    );

  if (!existing || !isWorkingStatus(existing.status)) return null;

  return {
    workerName: existing.workerName,
    sheetId: existing.sheetId,
    sheetName: sheetDisplayName(existing.clientCompany, existing.depot),
    status: existing.status,
  };
}
