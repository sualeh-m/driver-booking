import { and, eq, gte, lte } from "drizzle-orm";
import { db, bookingsTable, workersTable } from "@workspace/db";
import {
  addDays,
  classifyRestDecision,
  consecutiveRunLengthWith,
  isRestRuleWorkerType,
  isWorkingStatus,
  type RestDecision,
  type StatusByDate,
} from "@workspace/rest-rules";

// A run can never exceed the block threshold by much, but fetch a generous
// window so the consecutive count stays correct even with imported history.
const REST_WINDOW_DAYS = 60;

export type RestEvaluation = {
  // True only for HGV workers being booked into a working status — the only
  // case the rest-day rule applies. Warehouse workers and rest/off/holiday
  // statuses always come back with `applies: false`.
  applies: boolean;
  decision: RestDecision;
  consecutiveDays: number;
  workerName: string;
};

const NOT_APPLICABLE: RestEvaluation = {
  applies: false,
  decision: "ok",
  consecutiveDays: 0,
  workerName: "",
};

// Single source of rest-day enforcement, shared by every booking write path
// (PUT /bookings and CSV import) so the rule can never be bypassed by writing
// through a different endpoint. Reads are done on the passed connection, which
// may be the base db or an open transaction.
export async function evaluateRestRule(
  conn: typeof db,
  workerId: number,
  shiftDate: string,
  status: string,
): Promise<RestEvaluation> {
  if (!isWorkingStatus(status)) return NOT_APPLICABLE;

  const [worker] = await conn
    .select({
      workerType: workersTable.workerType,
      fullName: workersTable.fullName,
    })
    .from(workersTable)
    .where(eq(workersTable.id, workerId));

  if (!worker || !isRestRuleWorkerType(worker.workerType)) return NOT_APPLICABLE;

  const windowStart = addDays(shiftDate, -REST_WINDOW_DAYS);
  const windowEnd = addDays(shiftDate, REST_WINDOW_DAYS);
  const surrounding = await conn
    .select({
      shiftDate: bookingsTable.shiftDate,
      status: bookingsTable.status,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.workerId, workerId),
        gte(bookingsTable.shiftDate, windowStart),
        lte(bookingsTable.shiftDate, windowEnd),
      ),
    );

  const statusByDate: StatusByDate = {};
  for (const b of surrounding) statusByDate[b.shiftDate] = b.status;

  const consecutiveDays = consecutiveRunLengthWith(
    statusByDate,
    shiftDate,
    status,
  );

  return {
    applies: true,
    decision: classifyRestDecision(consecutiveDays),
    consecutiveDays,
    workerName: worker.fullName,
  };
}
