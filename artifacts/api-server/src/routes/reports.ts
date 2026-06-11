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
} from "@workspace/db";
import { GetOperationalMetricsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

// Bookings that count as a filled shift on a requirement.
const FILLED_STATUSES = ["Confirmed", "Pre-Booked"] as const;

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

  // Resolve the depot/client-selected sheets and split by worker type.
  // depotClientSheetIds: all selected sheets (any worker type) — used for the
  //   active-workers depot/client link.
  // scopedSheetIds: those that also match the worker-type filter — used for the
  //   sheet-scoped metrics (requirements, filled, no-shows) so fill rate stays coherent.
  const sheetRows = await db
    .select({ id: sheetsTable.id, workerType: sheetsTable.workerType })
    .from(sheetsTable)
    .where(restrictToSheets ? inArray(sheetsTable.id, selectedIds) : undefined);

  const depotClientSheetIds = sheetRows.map((s) => s.id);
  const scopedSheetIds = workerType
    ? sheetRows.filter((s) => s.workerType === workerType).map((s) => s.id)
    : depotClientSheetIds;

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

  // Requirements received: sum of quantity_needed in range over the scoped sheets.
  const requirementsPromise = (async (): Promise<number> => {
    if (scopedSheetIds.length === 0) return 0;
    const [row] = await db
      .select({
        total: sql<number>`coalesce(sum(${shiftRequirementsTable.quantityNeeded}), 0)::int`,
      })
      .from(shiftRequirementsTable)
      .where(
        and(
          inArray(shiftRequirementsTable.sheetId, scopedSheetIds),
          gte(shiftRequirementsTable.reqDate, start),
          lte(shiftRequirementsTable.reqDate, end),
        ),
      );
    return row?.total ?? 0;
  })();

  // Filled: bookings with a filled status in range over the scoped sheets.
  const filledPromise = (async (): Promise<number> => {
    if (scopedSheetIds.length === 0) return 0;
    const [row] = await db
      .select({ value: count() })
      .from(bookingsTable)
      .where(
        and(
          inArray(bookingsTable.sheetId, scopedSheetIds),
          inArray(bookingsTable.status, [...FILLED_STATUSES]),
          gte(bookingsTable.shiftDate, start),
          lte(bookingsTable.shiftDate, end),
        ),
      );
    return row?.value ?? 0;
  })();

  // No-shows: no_show events in range over the scoped sheets.
  const noShowsPromise = (async (): Promise<number> => {
    if (scopedSheetIds.length === 0) return 0;
    const [row] = await db
      .select({ value: count() })
      .from(eventsTable)
      .where(
        and(
          inArray(eventsTable.sheetId, scopedSheetIds),
          eq(eventsTable.eventType, "no_show"),
          gte(eventsTable.eventDate, start),
          lte(eventsTable.eventDate, end),
        ),
      );
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

export default router;
