import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  db,
  sheetsTable,
  sheetContactsTable,
  workersTable,
  bookingsTable,
} from "@workspace/db";
import {
  PreviewClientEmailBody,
  PreviewConfirmationsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const WORKING_STATUSES = new Set(["Available", "Pre-Booked", "Confirmed"]);

function shortTime(t: string | null): string | null {
  return t == null ? null : t.length >= 5 ? t.slice(0, 5) : t;
}

function formatLine(
  workerName: string,
  shiftDate: string,
  status: string,
  startTime: string | null,
): string {
  const time = startTime ? ` at ${startTime}` : "";
  return `${shiftDate}: ${workerName} — ${status}${time}`;
}

router.post("/previews/client-email", async (req, res): Promise<void> => {
  const parsed = PreviewClientEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { sheetId, start, end } = parsed.data;

  const [sheet] = await db
    .select()
    .from(sheetsTable)
    .where(eq(sheetsTable.id, sheetId));
  if (!sheet) {
    res.status(400).json({ error: "Unknown sheet" });
    return;
  }

  // Prefer the primary contact; fall back to any contact on the sheet.
  const contacts = await db
    .select()
    .from(sheetContactsTable)
    .where(eq(sheetContactsTable.sheetId, sheetId))
    .orderBy(asc(sheetContactsTable.id));
  const primary = contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null;

  const rows = await db
    .select({
      workerName: workersTable.fullName,
      jobRole: workersTable.jobRole,
      shiftDate: bookingsTable.shiftDate,
      status: bookingsTable.status,
      startTime: bookingsTable.startTime,
    })
    .from(bookingsTable)
    .innerJoin(workersTable, eq(workersTable.id, bookingsTable.workerId))
    .where(
      and(
        eq(bookingsTable.sheetId, sheetId),
        gte(bookingsTable.shiftDate, start),
        lte(bookingsTable.shiftDate, end),
      ),
    )
    .orderBy(asc(bookingsTable.shiftDate), asc(workersTable.fullName));

  const working = rows.filter((r) => WORKING_STATUSES.has(r.status));

  const subject = `Worker schedule — ${sheet.clientCompany} (${start} to ${end})`;
  const greeting = primary?.contactName ? `Hi ${primary.contactName},` : "Hello,";
  const bodyLines = working.map((r) =>
    formatLine(r.workerName, r.shiftDate, r.status, shortTime(r.startTime)),
  );
  const body = [
    greeting,
    "",
    `Please find below the confirmed worker schedule for ${sheet.clientCompany}${
      sheet.depot ? ` (${sheet.depot})` : ""
    } covering ${start} to ${end}:`,
    "",
    bodyLines.length > 0 ? bodyLines.join("\n") : "No shifts scheduled.",
    "",
    "Kind regards,",
    "The Recruitment Team",
  ].join("\n");

  res.json({
    subject,
    body,
    clientCompany: sheet.clientCompany,
    depot: sheet.depot,
    recipientName: primary?.contactName ?? null,
    recipientEmail: primary?.email ?? null,
    rows: working.map((r) => ({
      workerName: r.workerName,
      jobRole: r.jobRole,
      shiftDate: r.shiftDate,
      status: r.status,
      startTime: shortTime(r.startTime),
    })),
  });
});

router.post("/previews/confirmations", async (req, res): Promise<void> => {
  const parsed = PreviewConfirmationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { start, end } = parsed.data;
  const workerId = parsed.data.workerId ?? null;
  const sheetId = parsed.data.sheetId ?? null;

  const conditions = [
    gte(bookingsTable.shiftDate, start),
    lte(bookingsTable.shiftDate, end),
  ];
  if (workerId != null) conditions.push(eq(bookingsTable.workerId, workerId));
  if (sheetId != null) conditions.push(eq(bookingsTable.sheetId, sheetId));

  const rows = await db
    .select({
      workerId: workersTable.id,
      workerName: workersTable.fullName,
      phone: workersTable.phone,
      shiftDate: bookingsTable.shiftDate,
      status: bookingsTable.status,
      startTime: bookingsTable.startTime,
      sheetName: sheetsTable.name,
      clientCompany: sheetsTable.clientCompany,
      depot: sheetsTable.depot,
    })
    .from(bookingsTable)
    .innerJoin(workersTable, eq(workersTable.id, bookingsTable.workerId))
    .innerJoin(sheetsTable, eq(sheetsTable.id, bookingsTable.sheetId))
    .where(and(...conditions))
    .orderBy(asc(workersTable.fullName), asc(bookingsTable.shiftDate));

  const byWorker = new Map<
    number,
    {
      workerId: number;
      workerName: string;
      phone: string | null;
      shifts: {
        shiftDate: string;
        status: string;
        startTime: string | null;
        sheetName: string | null;
        clientCompany: string | null;
        depot: string | null;
      }[];
    }
  >();

  for (const r of rows) {
    if (!WORKING_STATUSES.has(r.status)) continue;
    let entry = byWorker.get(r.workerId);
    if (!entry) {
      entry = {
        workerId: r.workerId,
        workerName: r.workerName,
        phone: r.phone,
        shifts: [],
      };
      byWorker.set(r.workerId, entry);
    }
    entry.shifts.push({
      shiftDate: r.shiftDate,
      status: r.status,
      startTime: shortTime(r.startTime),
      sheetName: r.sheetName,
      clientCompany: r.clientCompany,
      depot: r.depot,
    });
  }

  const previews = Array.from(byWorker.values()).map((w) => {
    const lines = w.shifts.map((s) => {
      const time = s.startTime ? ` start ${s.startTime}` : "";
      const where = s.clientCompany ? ` @ ${s.clientCompany}` : "";
      const loc = s.depot ? ` (${s.depot})` : "";
      return `• ${s.shiftDate}${where}${loc} — ${s.status}${time}`;
    });
    const messageText = [
      `Hi ${w.workerName}, please confirm the following shifts:`,
      "",
      lines.join("\n"),
      "",
      "Reply YES to confirm. Thank you.",
    ].join("\n");
    return {
      workerId: w.workerId,
      workerName: w.workerName,
      phone: w.phone,
      messageText,
      shifts: w.shifts,
    };
  });

  res.json(previews);
});

export default router;
