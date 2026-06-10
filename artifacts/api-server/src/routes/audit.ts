import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  auditLogTable,
  usersTable,
  bookingsTable,
  driversTable,
} from "@workspace/db";
import { ListAuditQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/audit", async (req, res): Promise<void> => {
  const query = ListAuditQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const limit = query.data.limit ?? 100;

  const rows = await db
    .select({
      id: auditLogTable.id,
      bookingId: auditLogTable.bookingId,
      userId: auditLogTable.userId,
      action: auditLogTable.action,
      oldValue: auditLogTable.oldValue,
      newValue: auditLogTable.newValue,
      changedAt: auditLogTable.changedAt,
      userName: usersTable.name,
      driverName: driversTable.fullName,
      shiftDate: bookingsTable.shiftDate,
    })
    .from(auditLogTable)
    .leftJoin(usersTable, eq(usersTable.id, auditLogTable.userId))
    .leftJoin(bookingsTable, eq(bookingsTable.id, auditLogTable.bookingId))
    .leftJoin(driversTable, eq(driversTable.id, bookingsTable.driverId))
    .orderBy(desc(auditLogTable.changedAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      userId: r.userId,
      userName: r.userName,
      driverName: r.driverName,
      shiftDate: r.shiftDate,
      action: r.action,
      oldValue: r.oldValue,
      newValue: r.newValue,
      changedAt:
        r.changedAt instanceof Date ? r.changedAt.toISOString() : r.changedAt,
    })),
  );
});

export default router;
