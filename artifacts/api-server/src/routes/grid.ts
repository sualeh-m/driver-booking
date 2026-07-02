import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql, inArray } from "drizzle-orm";
import {
  db,
  workersTable,
  workerSheetsTable,
  bookingsTable,
  auditLogTable,
  sheetsTable,
  eventsTable,
  shiftRequirementsTable,
  BOOKING_STATUSES,
} from "@workspace/db";
import { GetGridQueryParams, ImportBookingsBody, JobRole } from "@workspace/api-zod";
import {
  addDays,
  consecutiveWorkingDaysEndingOn,
  isRestRuleJobRole,
  maxAllowedConsecutiveDays,
  type StatusByDate,
} from "@workspace/rest-rules";
import { serializeBooking } from "../lib/serialize";
import { getUserId } from "../lib/auth";
import { evaluateRestRule } from "../lib/restCheck";
import { findCrossSheetWorkingConflict } from "../lib/crossSheet";
import { parseCsv } from "../lib/csv";
import { resolveCustomJobTitle, rememberJobTitle } from "../lib/jobTitles";

const router: IRouter = Router();

// History fetched before the visible window so consecutive-day counters at the
// start of the range reflect prior bookings, not just what's on screen.
const REST_LOOKBACK_DAYS = 60;

const STATUS_SET = new Set<string>(BOOKING_STATUSES);

function normalizeTime(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

// CSV import is a place a worker's role gets SET, so it must land on the fixed
// JobRole set — never persist arbitrary free text. Map known legacy/free-text
// values to a canonical role; an unrecognised non-empty value becomes "Other";
// a blank cell stays null (no role stated). Keeping this canonical also lets the
// rest-day rule (which keys off job role) recognise imported HGV-type drivers.
const JOB_ROLE_VALUES = Object.values(JobRole) as string[];
function normalizeCsvJobRole(raw: string): (typeof JOB_ROLE_VALUES)[number] | null {
  const t = raw.trim();
  if (t === "") return null;
  const lower = t.toLowerCase();
  const exact = JOB_ROLE_VALUES.find((r) => r.toLowerCase() === lower);
  if (exact) return exact;
  if (/class\s*1|c1|hgv\s*1/.test(lower)) return JobRole.HGV_1;
  if (/class\s*2|c2|hgv\s*2/.test(lower)) return JobRole.HGV_2;
  if (lower.includes("trunk")) return JobRole.Trunker;
  if (lower.includes("coach") || lower.includes("bus")) return JobRole["Bus/Coach"];
  if (lower.includes("fork")) return JobRole.Forklift;
  if (lower.includes("mate")) return JobRole.Drivers_Mate;
  if (lower.includes("van")) return JobRole.Van;
  if (lower.includes("warehouse") || lower.includes("pick")) return JobRole.Warehouse;
  return JobRole.Other;
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
      customJobTitle: workersTable.customJobTitle,
      workerType: workersTable.workerType,
      startDate: workersTable.startDate,
      status: workersTable.status,
      doNotBook: workersTable.doNotBook,
      syncedAt: workersTable.syncedAt,
      note: workerSheetsTable.notes,
    })
    .from(workerSheetsTable)
    .innerJoin(workersTable, eq(workersTable.id, workerSheetsTable.workerId))
    .where(
      and(
        eq(workerSheetsTable.sheetId, sheetId),
        eq(workersTable.doNotBook, false),
        eq(workersTable.status, "active"),
      ),
    )
    .orderBy(
      sql`case ${workersTable.jobRole}
        when 'HGV 1' then 1
        when 'HGV 2' then 2
        when 'Trunker' then 3
        when 'Bus/Coach' then 4
        when 'Van' then 5
        when 'Warehouse' then 6
        when 'Forklift' then 7
        when 'Drivers Mate' then 8
        when 'Other' then 9
        else 10
      end`,
      // Within the "Other" group, sort alphabetically by custom title first
      // (Postgres ASC puts NULLs last, so untitled Others trail the titled).
      sql`case when ${workersTable.jobRole} = 'Other' then lower(${workersTable.customJobTitle}) end`,
      workersTable.fullName,
    );

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

  // No-show events in the visible window so the grid can paint those cells red.
  // Display-only: read straight from the events table so it persists on refresh.
  const visibleWorkerIds = workers.map((w) => w.id);
  const noShows =
    visibleWorkerIds.length > 0
      ? await db
          .select({
            workerId: eventsTable.workerId,
            shiftDate: eventsTable.eventDate,
          })
          .from(eventsTable)
          .where(
            and(
              eq(eventsTable.eventType, "no_show"),
              inArray(eventsTable.workerId, visibleWorkerIds),
              gte(eventsTable.eventDate, start),
              lte(eventsTable.eventDate, end),
            ),
          )
      : [];

  // Consecutive-working-day counters (HGV workers only). Pull extra history
  // before the window so counts at the start of the range are accurate, then
  // compute the "days worked since last rest" value for each visible day.
  const hgvWorkerIds = workers
    .filter((w) => isRestRuleJobRole(w.jobRole))
    .map((w) => w.id);

  const restCounters: { workerId: number; shiftDate: string; days: number }[] =
    [];

  if (hgvWorkerIds.length > 0) {
    const lookbackStart = addDays(start, -REST_LOOKBACK_DAYS);
    const history = await db
      .select({
        workerId: bookingsTable.workerId,
        shiftDate: bookingsTable.shiftDate,
        status: bookingsTable.status,
      })
      .from(bookingsTable)
      .where(
        and(
          inArray(bookingsTable.workerId, hgvWorkerIds),
          gte(bookingsTable.shiftDate, lookbackStart),
          lte(bookingsTable.shiftDate, end),
        ),
      );

    const byWorker = new Map<number, StatusByDate>();
    for (const id of hgvWorkerIds) byWorker.set(id, {});
    for (const h of history) {
      const map = byWorker.get(h.workerId);
      if (map) map[h.shiftDate] = h.status;
    }

    for (const id of hgvWorkerIds) {
      const map = byWorker.get(id)!;
      for (let date = start; date <= end; date = addDays(date, 1)) {
        const days = consecutiveWorkingDaysEndingOn(map, date);
        if (days > 0) restCounters.push({ workerId: id, shiftDate: date, days });
      }
    }
  }

  // Per-day total quantity needed for this sheet across all roles, within the
  // visible window. Powers the Required / Filled / Still Needed summary rows.
  const requirementRows = await db
    .select({
      shiftDate: shiftRequirementsTable.reqDate,
      required: sql<number>`sum(${shiftRequirementsTable.quantityNeeded})::int`,
    })
    .from(shiftRequirementsTable)
    .where(
      and(
        eq(shiftRequirementsTable.sheetId, sheetId),
        gte(shiftRequirementsTable.reqDate, start),
        lte(shiftRequirementsTable.reqDate, end),
      ),
    )
    .groupBy(shiftRequirementsTable.reqDate);

  res.json({
    workers: workers.map((w) => ({
      id: w.id,
      vincereId: w.vincereId,
      fullName: w.fullName,
      phone: w.phone,
      jobRole: w.jobRole,
      customJobTitle: w.customJobTitle,
      workerType: w.workerType,
      startDate: w.startDate,
      status: w.status,
      doNotBook: w.doNotBook,
      syncedAt:
        w.syncedAt instanceof Date ? w.syncedAt.toISOString() : w.syncedAt,
      note: w.note,
    })),
    bookings: bookings.map(serializeBooking),
    restCounters,
    noShows,
    requirements: requirementRows,
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
    const rawRole = idxRole !== -1 ? (row[idxRole] ?? "").trim() : "";
    const jobRole = normalizeCsvJobRole(rawRole);
    // An unrecognised role becomes "Other" — keep the raw text as the custom
    // job title so the import never loses what the sheet actually said. A cell
    // that literally says "Other" has no real title to keep, and "Other"
    // requires one (same rule as the create/edit endpoints), so reject the row.
    if (jobRole === JobRole.Other && rawRole.toLowerCase() === "other") {
      errors.push(
        `Line ${lineNo}: job_role "Other" needs an actual job title — put the real role text (e.g. "Recovery Driver") in the column instead`,
      );
      continue;
    }
    const resolvedTitle = resolveCustomJobTitle(jobRole, rawRole);
    if (!resolvedTitle.ok) {
      errors.push(`Line ${lineNo}: ${resolvedTitle.error}`);
      continue;
    }
    const customJobTitle = resolvedTitle.value;

    try {
      await db.transaction(async (tx) => {
        let [worker] = await tx
          .select()
          .from(workersTable)
          .where(
            sql`lower(${workersTable.fullName}) = ${fullName.toLowerCase()}`,
          )
          .limit(1);

        // HGV rest-day safety check — the hard block must hold on every write
        // path, so import cannot create 7+ consecutive HGV days either. Only
        // existing workers can accumulate a run here; a brand-new worker's
        // first row is created below and is then seen as existing on later
        // rows. The warn threshold is allowed silently for bulk import.
        if (worker) {
          const rest = await evaluateRestRule(
            db,
            worker.id,
            shiftDate,
            status,
          );
          if (rest.applies && rest.decision === "block") {
            throw new Error(
              `would be ${rest.consecutiveDays} consecutive working days for ${rest.workerName} (HGV); max is ${maxAllowedConsecutiveDays()} — add a Rest, Off or Holiday day to break the run first`,
            );
          }
        }

        if (!worker) {
          [worker] = await tx
            .insert(workersTable)
            .values({
              fullName,
              phone: phone || null,
              jobRole: jobRole || null,
              customJobTitle,
              // Workers are only ever HGV/Warehouse, derived from the row's
              // job role (HGV-type roles → HGV, otherwise Warehouse). Sheets
              // carry no worker type.
              workerType: isRestRuleJobRole(jobRole || null)
                ? "HGV"
                : "Warehouse",
            })
            .returning();
          // Remember the title in the suggestion list too.
          await rememberJobTitle(tx, customJobTitle);
          workersCreated++;
        } else {
          workersMatched++;
        }

        await tx
          .insert(workerSheetsTable)
          .values({ sheetId, workerId: worker.id })
          .onConflictDoNothing();

        // Cross-sheet hard block — the same invariant the single/batch booking
        // endpoints enforce must hold on the import path too: a worker is one
        // person across all sheets, so never silently move/overwrite a working
        // booking that lives on another sheet. The per-worker advisory lock
        // (held to commit) makes the check + upsert atomic against concurrent
        // booking writes for the same worker.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${worker.id})`);
        const conflict = await findCrossSheetWorkingConflict(
          tx,
          worker.id,
          shiftDate,
          sheetId,
        );
        if (conflict) {
          throw new Error(
            `${conflict.workerName} is already working elsewhere that day (${conflict.sheetName} · ${conflict.status}); remove that booking first`,
          );
        }

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

        // A worker's start_date is the date of their first ever booking. It only
        // ever moves earlier (a genuinely earlier booking corrects it), never
        // later — so out-of-order import rows still record the true first booking.
        const [{ first }] = await tx
          .select({ first: sql<string | null>`min(${bookingsTable.shiftDate})` })
          .from(bookingsTable)
          .where(eq(bookingsTable.workerId, worker.id));
        if (first && (worker.startDate == null || first < worker.startDate)) {
          await tx
            .update(workersTable)
            .set({ startDate: first })
            .where(eq(workersTable.id, worker.id));
        }
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
