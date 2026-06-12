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

export type RestBatchDecision = {
  decision: RestDecision;
  consecutiveDays: number;
};

export type RestBatchResult = {
  workerName: string;
  perDate: Map<string, RestBatchDecision>;
};

// Batch counterpart of evaluateRestRule for drag-fill: classifies many dates
// for ONE worker against the SAME status, exactly as if each were booked
// individually in ascending date order. Reads the surrounding window once, then
// accumulates the would-be statuses in memory — ok and warn cells count toward
// later cells' runs (a warn is allowed once acknowledged), but a blocked cell is
// never written and therefore breaks the streak for subsequent cells, matching
// the single-cell behaviour. The classification is independent of whether the
// caller ultimately writes the warn cells, so the same decisions hold on the
// acknowledge resubmit.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function evaluateRestBatchForWorker(
  conn: typeof db | Tx,
  workerId: number,
  dates: string[],
  status: string,
): Promise<RestBatchResult> {
  const sorted = [...new Set(dates)].sort();

  const allOk = (workerName: string): RestBatchResult => {
    const perDate = new Map<string, RestBatchDecision>();
    for (const d of sorted) perDate.set(d, { decision: "ok", consecutiveDays: 0 });
    return { workerName, perDate };
  };

  // A non-working status never triggers the rule.
  if (!isWorkingStatus(status)) return allOk("");

  const [worker] = await conn
    .select({
      workerType: workersTable.workerType,
      fullName: workersTable.fullName,
    })
    .from(workersTable)
    .where(eq(workersTable.id, workerId));

  if (!worker) return allOk("");
  if (!isRestRuleWorkerType(worker.workerType)) return allOk(worker.fullName);
  if (sorted.length === 0) return { workerName: worker.fullName, perDate: new Map() };

  const windowStart = addDays(sorted[0], -REST_WINDOW_DAYS);
  const windowEnd = addDays(sorted[sorted.length - 1], REST_WINDOW_DAYS);
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

  const perDate = new Map<string, RestBatchDecision>();
  for (const date of sorted) {
    const consecutiveDays = consecutiveRunLengthWith(statusByDate, date, status);
    const decision = classifyRestDecision(consecutiveDays);
    perDate.set(date, { decision, consecutiveDays });
    // Count ok and warn cells toward subsequent runs; a blocked cell is never
    // saved, so leave its date unset and let it break the following streak.
    if (decision !== "block") statusByDate[date] = status;
  }

  return { workerName: worker.fullName, perDate };
}
