import { Router, type IRouter } from "express";
import { and, count, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db, workersTable, sheetsTable, bookingsTable } from "@workspace/db";
import { todayString, weekRange } from "../lib/dates";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const today = todayString();
  const week = weekRange(new Date());

  const [[workers], [activeWorkers], [sheets], [todayShifts], [weekShifts]] =
    await Promise.all([
      db.select({ value: count() }).from(workersTable),
      db
        .select({ value: count() })
        .from(workersTable)
        .where(eq(workersTable.status, "active")),
      db.select({ value: count() }).from(sheetsTable),
      db
        .select({ value: count() })
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.shiftDate, today),
            isNotNull(bookingsTable.startTime),
          ),
        ),
      db
        .select({ value: count() })
        .from(bookingsTable)
        .where(
          and(
            gte(bookingsTable.shiftDate, week.start),
            lte(bookingsTable.shiftDate, week.end),
            isNotNull(bookingsTable.startTime),
          ),
        ),
    ]);

  const breakdown = await db
    .select({ status: bookingsTable.status, value: count() })
    .from(bookingsTable)
    .where(
      and(
        gte(bookingsTable.shiftDate, week.start),
        lte(bookingsTable.shiftDate, week.end),
      ),
    )
    .groupBy(bookingsTable.status)
    .orderBy(sql`count(*) desc`);

  res.json({
    totalWorkers: workers.value,
    totalActiveWorkers: activeWorkers.value,
    totalSheets: sheets.value,
    shiftsToday: todayShifts.value,
    shiftsThisWeek: weekShifts.value,
    statusBreakdown: breakdown.map((b) => ({
      status: b.status,
      count: b.value,
    })),
  });
});

export default router;
