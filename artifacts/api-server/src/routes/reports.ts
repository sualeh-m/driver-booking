import { Router, type IRouter } from "express";
import { and, eq, gte, lte, inArray, count, countDistinct, sql } from "drizzle-orm";
import {
  db,
  sheetsTable,
  workersTable,
  workerSheetsTable,
  bookingsTable,
  shiftRequirementsTable,
  eventsTable,
  submissionsTable,
  leaversTable,
} from "@workspace/db";
import {
  GetOperationalMetricsQueryParams,
  GetPeopleMetricsQueryParams,
} from "@workspace/api-zod";
import { todayString } from "../lib/dates";

const router: IRouter = Router();

// Bookings that count as a filled shift on a requirement.
const FILLED_STATUSES = ["Confirmed", "Pre-Booked"] as const;

// Leaver reasons, in the canonical order from the OpenAPI LeaverReason enum.
const LEAVER_REASONS = [
  "low_rates",
  "travel_distance",
  "permanent_employment",
  "shift_pattern",
  "performance_issues",
  "attendance_issues",
  "other",
] as const;

// Length-of-service buckets, evaluated low→high (first match wins). Day
// thresholds are contiguous so every worker with a start date lands in exactly
// one bucket: <7 / <28 (4 weeks) / <90 / <180 / 180+.
const RETENTION_BUCKETS = [
  { bucket: "under_1_week", maxDays: 7 },
  { bucket: "1_4_weeks", maxDays: 28 },
  { bucket: "1_3_months", maxDays: 90 },
  { bucket: "3_6_months", maxDays: 180 },
  { bucket: "6_months_plus", maxDays: Infinity },
] as const;

function serviceDays(startDate: string, endDate: string): number {
  const ms = Date.parse(endDate) - Date.parse(startDate);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

router.get("/reports/operational", async (req, res): Promise<void> => {
  const parsed = GetOperationalMetricsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { start, end, workerType } = parsed.data;

  // Parse the comma-separated depot/client sheet selection (omit = all sheets).
  const selectedIds =
    parsed.data.sheetIds
      ?.split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n)) ?? [];
  const restrictToSheets = selectedIds.length > 0;

  // Resolve the depot/client-selected sheets. Sheets carry NO worker type, so
  // the worker-type filter is applied per-metric via the WORKER's own type:
  // filled bookings and no-show events join workers on worker_type.
  // Requirements have no worker attached, so they always cover the full
  // depot/client selection regardless of the worker-type filter.
  const sheetRows = await db
    .select({ id: sheetsTable.id })
    .from(sheetsTable)
    .where(restrictToSheets ? inArray(sheetsTable.id, selectedIds) : undefined);

  const depotClientSheetIds = sheetRows.map((s) => s.id);

  // Active workers matching the filters.
  // - all depots/clients selected: every active worker of the type.
  // - a subset selected: only active workers linked (workerSheets) to those sheets.
  const activeWorkersPromise = (async (): Promise<number> => {
    const conds = [eq(workersTable.status, "active")];
    if (workerType) conds.push(eq(workersTable.workerType, workerType));

    if (!restrictToSheets) {
      const [row] = await db
        .select({ value: countDistinct(workersTable.id) })
        .from(workersTable)
        .where(and(...conds));
      return row?.value ?? 0;
    }

    if (depotClientSheetIds.length === 0) return 0;
    const [row] = await db
      .select({ value: countDistinct(workersTable.id) })
      .from(workersTable)
      .innerJoin(
        workerSheetsTable,
        eq(workerSheetsTable.workerId, workersTable.id),
      )
      .where(
        and(...conds, inArray(workerSheetsTable.sheetId, depotClientSheetIds)),
      );
    return row?.value ?? 0;
  })();

  // Requirements received: sum of quantity_needed in range over the selected sheets.
  const requirementsPromise = (async (): Promise<number> => {
    if (depotClientSheetIds.length === 0) return 0;
    const [row] = await db
      .select({
        total: sql<number>`coalesce(sum(${shiftRequirementsTable.quantityNeeded}), 0)::int`,
      })
      .from(shiftRequirementsTable)
      .where(
        and(
          inArray(shiftRequirementsTable.sheetId, depotClientSheetIds),
          gte(shiftRequirementsTable.reqDate, start),
          lte(shiftRequirementsTable.reqDate, end),
        ),
      );
    return row?.total ?? 0;
  })();

  // Filled: bookings with a filled status in range over the selected sheets,
  // filtered by the booked WORKER's own type when a worker-type filter is set.
  const filledPromise = (async (): Promise<number> => {
    if (depotClientSheetIds.length === 0) return 0;
    const conds = [
      inArray(bookingsTable.sheetId, depotClientSheetIds),
      inArray(bookingsTable.status, [...FILLED_STATUSES]),
      gte(bookingsTable.shiftDate, start),
      lte(bookingsTable.shiftDate, end),
    ];
    if (workerType) {
      const [row] = await db
        .select({ value: count() })
        .from(bookingsTable)
        .innerJoin(workersTable, eq(bookingsTable.workerId, workersTable.id))
        .where(and(...conds, eq(workersTable.workerType, workerType)));
      return row?.value ?? 0;
    }
    const [row] = await db
      .select({ value: count() })
      .from(bookingsTable)
      .where(and(...conds));
    return row?.value ?? 0;
  })();

  // No-shows: no_show events in range over the selected sheets, filtered by
  // the WORKER's own type when a worker-type filter is set.
  const noShowsPromise = (async (): Promise<number> => {
    if (depotClientSheetIds.length === 0) return 0;
    const conds = [
      inArray(eventsTable.sheetId, depotClientSheetIds),
      eq(eventsTable.eventType, "no_show"),
      gte(eventsTable.eventDate, start),
      lte(eventsTable.eventDate, end),
    ];
    if (workerType) {
      const [row] = await db
        .select({ value: count() })
        .from(eventsTable)
        .innerJoin(workersTable, eq(eventsTable.workerId, workersTable.id))
        .where(and(...conds, eq(workersTable.workerType, workerType)));
      return row?.value ?? 0;
    }
    const [row] = await db
      .select({ value: count() })
      .from(eventsTable)
      .where(and(...conds));
    return row?.value ?? 0;
  })();

  const [activeWorkers, requirementsReceived, filled, noShows] =
    await Promise.all([
      activeWorkersPromise,
      requirementsPromise,
      filledPromise,
      noShowsPromise,
    ]);

  const fillRate =
    requirementsReceived > 0
      ? Math.round((filled / requirementsReceived) * 1000) / 10
      : null;

  res.json({
    start,
    end,
    activeWorkers,
    requirementsReceived,
    filled,
    fillRate,
    noShows,
  });
});

router.get("/reports/people", async (req, res): Promise<void> => {
  const parsed = GetPeopleMetricsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { start, end, workerType } = parsed.data;

  // Parse the comma-separated depot/client sheet selection (omit = all sheets).
  const selectedIds =
    parsed.data.sheetIds
      ?.split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n)) ?? [];
  const restrictToSheets = selectedIds.length > 0;

  // People metrics are worker-centric: a worker matches when its own
  // worker_type matches the filter AND (when a depot/client subset is selected)
  // it is linked via workerSheets to one of those sheets. We resolve the set of
  // eligible worker IDs once and scope every metric to it.
  const workerConds = [];
  if (workerType) workerConds.push(eq(workersTable.workerType, workerType));
  if (restrictToSheets) {
    workerConds.push(
      inArray(
        workersTable.id,
        db
          .select({ id: workerSheetsTable.workerId })
          .from(workerSheetsTable)
          .where(inArray(workerSheetsTable.sheetId, selectedIds)),
      ),
    );
  }

  const eligibleWorkers = await db
    .select({
      id: workersTable.id,
      startDate: workersTable.startDate,
      status: workersTable.status,
    })
    .from(workersTable)
    .where(workerConds.length > 0 ? and(...workerConds) : undefined);

  const eligibleWorkerIds = eligibleWorkers.map((w) => w.id);

  const emptyLeaverReasons = LEAVER_REASONS.map((reason) => ({
    reason,
    count: 0,
  }));
  const emptyRetention = RETENTION_BUCKETS.map((b) => ({
    bucket: b.bucket,
    count: 0,
  }));

  // Submissions in range (and how many passed). Submissions are NOT scoped via
  // eligibleWorkerIds — candidate submissions have no worker at all and must
  // still count. Instead they are scoped by the submission's OWN sheet, and the
  // worker-type filter uses the linked worker's type when there is one,
  // otherwise the type derived from the submission's recorded job role
  // (HGV-type roles → HGV, anything else → Warehouse; legacy rows with no role
  // only match when no type filter is set).
  const submissionsPromise = (async (): Promise<{
    submitted: number;
    passed: number;
  }> => {
    const conds: ReturnType<typeof sql>[] = [];
    conds.push(sql`${submissionsTable.submittedDate} >= ${start}`);
    conds.push(sql`${submissionsTable.submittedDate} <= ${end}`);
    if (restrictToSheets) {
      if (selectedIds.length === 0) return { submitted: 0, passed: 0 };
      conds.push(inArray(submissionsTable.sheetId, selectedIds));
    }
    if (workerType) {
      conds.push(sql`
        CASE
          WHEN ${workersTable.id} IS NOT NULL THEN ${workersTable.workerType}
          WHEN ${submissionsTable.jobRole} IN ('HGV 1','HGV 2','Trunker','Bus/Coach') THEN 'HGV'
          WHEN ${submissionsTable.jobRole} IS NOT NULL THEN 'Warehouse'
          ELSE NULL
        END = ${workerType}`);
    }
    const [row] = await db
      .select({
        submitted: count(),
        passed: sql<number>`coalesce(sum(case when ${submissionsTable.outcome} = 'passed' then 1 else 0 end), 0)::int`,
      })
      .from(submissionsTable)
      .leftJoin(workersTable, eq(workersTable.id, submissionsTable.workerId))
      .where(and(...conds));
    return { submitted: row?.submitted ?? 0, passed: row?.passed ?? 0 };
  })();

  // No eligible workers → every worker-scoped people metric is zero, but the
  // submission metrics above still apply (candidates are not workers).
  if (eligibleWorkerIds.length === 0) {
    const submissions = await submissionsPromise;
    res.json({
      start,
      end,
      submitted: submissions.submitted,
      passed: submissions.passed,
      passRate:
        submissions.submitted > 0
          ? Math.round((submissions.passed / submissions.submitted) * 1000) / 10
          : null,
      leavers: 0,
      leaverReasons: emptyLeaverReasons,
      retention: emptyRetention,
      notStarted: 0,
      cpcFailures: 0,
      testFailures: 0,
    });
    return;
  }

  // Leavers in range, grouped by reason.
  const leaversPromise = (async (): Promise<Map<string, number>> => {
    const rows = await db
      .select({ reason: leaversTable.reason, value: count() })
      .from(leaversTable)
      .where(
        and(
          inArray(leaversTable.workerId, eligibleWorkerIds),
          gte(leaversTable.leaveDate, start),
          lte(leaversTable.leaveDate, end),
        ),
      )
      .groupBy(leaversTable.reason);
    return new Map(rows.map((r) => [r.reason, r.value]));
  })();

  // Latest leave date per eligible worker (for retention service length of
  // workers who have left). Snapshot — not bound by the date range.
  const leaveDatesPromise = (async (): Promise<Map<number, string>> => {
    const rows = await db
      .select({
        workerId: leaversTable.workerId,
        leaveDate: sql<string>`max(${leaversTable.leaveDate})`,
      })
      .from(leaversTable)
      .where(inArray(leaversTable.workerId, eligibleWorkerIds))
      .groupBy(leaversTable.workerId);
    return new Map(rows.map((r) => [r.workerId, r.leaveDate]));
  })();

  // CPC and test failures in range (events are HGV-only at creation, so a
  // Warehouse worker-type filter naturally yields zero here).
  const failuresPromise = (async (): Promise<{
    cpc: number;
    test: number;
  }> => {
    const [row] = await db
      .select({
        cpc: sql<number>`coalesce(sum(case when ${eventsTable.eventType} = 'cpc_failure' then 1 else 0 end), 0)::int`,
        test: sql<number>`coalesce(sum(case when ${eventsTable.eventType} = 'test_failure' then 1 else 0 end), 0)::int`,
      })
      .from(eventsTable)
      .where(
        and(
          inArray(eventsTable.workerId, eligibleWorkerIds),
          inArray(eventsTable.eventType, ["cpc_failure", "test_failure"]),
          gte(eventsTable.eventDate, start),
          lte(eventsTable.eventDate, end),
        ),
      );
    return { cpc: row?.cpc ?? 0, test: row?.test ?? 0 };
  })();

  const [submissions, leaverCounts, leaveDates, failures] = await Promise.all([
    submissionsPromise,
    leaversPromise,
    leaveDatesPromise,
    failuresPromise,
  ]);

  const leaverReasons = LEAVER_REASONS.map((reason) => ({
    reason,
    count: leaverCounts.get(reason) ?? 0,
  }));
  const leavers = leaverReasons.reduce((sum, r) => sum + r.count, 0);

  // Retention snapshot: bucket every eligible worker that has a start date by
  // length of service (start→leaveDate for leavers, start→today for active).
  const today = todayString();
  const bucketCounts = new Map<string, number>(
    RETENTION_BUCKETS.map((b) => [b.bucket, 0]),
  );
  let notStarted = 0;
  for (const w of eligibleWorkers) {
    if (!w.startDate) {
      notStarted++;
      continue;
    }
    const endDate =
      w.status === "left" ? (leaveDates.get(w.id) ?? today) : today;
    const days = serviceDays(w.startDate, endDate);
    const bucket =
      RETENTION_BUCKETS.find((b) => days < b.maxDays) ?? RETENTION_BUCKETS[4];
    bucketCounts.set(bucket.bucket, (bucketCounts.get(bucket.bucket) ?? 0) + 1);
  }
  const retention = RETENTION_BUCKETS.map((b) => ({
    bucket: b.bucket,
    count: bucketCounts.get(b.bucket) ?? 0,
  }));

  const passRate =
    submissions.submitted > 0
      ? Math.round((submissions.passed / submissions.submitted) * 1000) / 10
      : null;

  res.json({
    start,
    end,
    submitted: submissions.submitted,
    passed: submissions.passed,
    passRate,
    leavers,
    leaverReasons,
    retention,
    notStarted,
    cpcFailures: failures.cpc,
    testFailures: failures.test,
  });
});

export default router;
