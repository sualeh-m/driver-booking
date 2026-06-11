import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  workersTable,
  workerSheetsTable,
  bookingsTable,
  auditLogTable,
  sheetsTable,
  BOOKING_STATUSES,
} from "@workspace/db";
import { GetGridQueryParams, ImportBookingsBody } from "@workspace/api-zod";
import { serializeBooking } from "../lib/serialize";
import { getUserId } from "../lib/auth";
import { parseCsv } from "../lib/csv";

const router: IRouter = Router();

const STATUS_SET = new Set<string>(BOOKING_STATUSES);

function normalizeTime(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function normalizeDate(raw: string): string | null {
  const t = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

router.get("/grid", async (req, res): Promise<void> => {
  const query = GetGridQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { sheetId, start, end } = query.data;

  const workers = await db
    .select({
      id: workersTable.id,
      vincereId: workersTable.vincereId,
      fullName: workersTable.fullName,
      phone: workersTable.phone,
      jobRole: workersTable.jobRole,
      workerType: workersTable.workerType,
      startDate: workersTable.startDate,
      status: workersTable.status,
      syncedAt: workersTable.syncedAt,
      note: workerSheetsTable.notes,
    })
    .from(workerSheetsTable)
    .innerJoin(workersTable, eq(workersTable.id, workerSheetsTable.workerId))
    .where(eq(workerSheetsTable.sheetId, sheetId))
    .orderBy(workersTable.fullName);

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.sheetId, sheetId),
        gte(bookingsTable.shiftDate, start),
        lte(bookingsTable.shiftDate, end),
      ),
    );

  res.json({
    workers: workers.map((w) => ({
      id: w.id,
      vincereId: w.vincereId,
      fullName: w.fullName,
      phone: w.phone,
      jobRole: w.jobRole,
      workerType: w.workerType,
      startDate: w.startDate,
      status: w.status,
      syncedAt:
        w.syncedAt instanceof Date ? w.syncedAt.toISOString() : w.syncedAt,
      note: w.note,
    })),
    bookings: bookings.map(serializeBooking),
  });
});

router.post("/import", async (req, res): Promise<void> => {
  const parsed = ImportBookingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getUserId(req);
  if (userId == null) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  const { sheetId, csvText } = parsed.data;

  const [sheet] = await db
    .select()
    .from(sheetsTable)
    .where(eq(sheetsTable.id, sheetId));
  if (!sheet) {
    res.status(400).json({ error: "Unknown sheet" });
    return;
  }

  const rows = parseCsv(csvText);
  const errors: string[] = [];
  let workersCreated = 0;
  let workersMatched = 0;
  let bookingsUpserted = 0;

  if (rows.length === 0) {
    res.json({ workersCreated, workersMatched, bookingsUpserted, errors });
    return;
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);
  const idxName = col("full_name");
  const idxPhone = col("phone");
  const idxRole = col("job_role");
  const idxDate = col("shift_date");
  const idxStatus = col("status");
  const idxTime = col("start_time");

  if (idxName === -1 || idxDate === -1 || idxStatus === -1) {
    res.status(400).json({
      error:
        "CSV must include at least full_name, shift_date and status columns",
    });
    return;
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const lineNo = r + 1;
    const fullName = (row[idxName] ?? "").trim();
    if (fullName === "") {
      errors.push(`Line ${lineNo}: missing full_name`);
      continue;
    }

    const shiftDate = normalizeDate(row[idxDate] ?? "");
    if (!shiftDate) {
      errors.push(`Line ${lineNo}: invalid shift_date (need YYYY-MM-DD)`);
      continue;
    }

    const status = (row[idxStatus] ?? "").trim();
    if (!STATUS_SET.has(status)) {
      errors.push(`Line ${lineNo}: invalid status "${status}"`);
      continue;
    }

    const startTime =
      idxTime !== -1 ? normalizeTime(row[idxTime] ?? "") : null;
    const phone = idxPhone !== -1 ? (row[idxPhone] ?? "").trim() : "";
    const jobRole = idxRole !== -1 ? (row[idxRole] ?? "").trim() : "";

    try {
      await db.transaction(async (tx) => {
        let [worker] = await tx
          .select()
          .from(workersTable)
          .where(
            sql`lower(${workersTable.fullName}) = ${fullName.toLowerCase()}`,
          )
          .limit(1);

        if (!worker) {
          [worker] = await tx
            .insert(workersTable)
            .values({
              fullName,
              phone: phone || null,
              jobRole: jobRole || null,
              workerType: sheet.workerType,
            })
            .returning();
          workersCreated++;
        } else {
          workersMatched++;
        }

        await tx
          .insert(workerSheetsTable)
          .values({ sheetId, workerId: worker.id })
          .onConflictDoNothing();

        const [existing] = await tx
          .select()
          .from(bookingsTable)
          .where(
            and(
              eq(bookingsTable.workerId, worker.id),
              eq(bookingsTable.shiftDate, shiftDate),
            ),
          );

        if (!existing) {
          const [created] = await tx
            .insert(bookingsTable)
            .values({
              workerId: worker.id,
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
            newValue: startTime ? `${status} @ ${startTime}` : status,
          });
        } else {
          await tx
            .update(bookingsTable)
            .set({
              sheetId,
              status,
              startTime,
              updatedBy: userId,
              updatedAt: new Date(),
            })
            .where(eq(bookingsTable.id, existing.id));
          await tx.insert(auditLogTable).values({
            bookingId: existing.id,
            userId,
            action: "status_change",
            oldValue: existing.status,
            newValue: status,
          });
        }
        bookingsUpserted++;
      });
    } catch (err) {
      errors.push(
        `Line ${lineNo}: ${err instanceof Error ? err.message : "import failed"}`,
      );
    }
  }

  res.json({ workersCreated, workersMatched, bookingsUpserted, errors });
});

export default router;
