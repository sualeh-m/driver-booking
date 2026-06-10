import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  db,
  contractsTable,
  driversTable,
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
  driverName: string,
  shiftDate: string,
  status: string,
  startTime: string | null,
): string {
  const time = startTime ? ` at ${startTime}` : "";
  return `${shiftDate}: ${driverName} — ${status}${time}`;
}

router.post("/previews/client-email", async (req, res): Promise<void> => {
  const parsed = PreviewClientEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { contractId, start, end } = parsed.data;

  const [contract] = await db
    .select()
    .from(contractsTable)
    .where(eq(contractsTable.id, contractId));
  if (!contract) {
    res.status(400).json({ error: "Unknown contract" });
    return;
  }

  const rows = await db
    .select({
      driverName: driversTable.fullName,
      jobRole: driversTable.jobRole,
      shiftDate: bookingsTable.shiftDate,
      status: bookingsTable.status,
      startTime: bookingsTable.startTime,
    })
    .from(bookingsTable)
    .innerJoin(driversTable, eq(driversTable.id, bookingsTable.driverId))
    .where(
      and(
        eq(bookingsTable.contractId, contractId),
        gte(bookingsTable.shiftDate, start),
        lte(bookingsTable.shiftDate, end),
      ),
    )
    .orderBy(asc(bookingsTable.shiftDate), asc(driversTable.fullName));

  const working = rows.filter((r) => WORKING_STATUSES.has(r.status));

  const subject = `Driver schedule — ${contract.companyName} (${start} to ${end})`;
  const greeting = contract.clientContactName
    ? `Hi ${contract.clientContactName},`
    : "Hello,";
  const bodyLines = working.map((r) =>
    formatLine(r.driverName, r.shiftDate, r.status, shortTime(r.startTime)),
  );
  const body = [
    greeting,
    "",
    `Please find below the confirmed driver schedule for ${contract.companyName}${
      contract.location ? ` (${contract.location})` : ""
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
    companyName: contract.companyName,
    location: contract.location,
    recipientName: contract.clientContactName,
    recipientEmail: contract.clientContactEmail,
    rows: working.map((r) => ({
      driverName: r.driverName,
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
  const driverId = parsed.data.driverId ?? null;
  const contractId = parsed.data.contractId ?? null;

  const conditions = [
    gte(bookingsTable.shiftDate, start),
    lte(bookingsTable.shiftDate, end),
  ];
  if (driverId != null) conditions.push(eq(bookingsTable.driverId, driverId));
  if (contractId != null)
    conditions.push(eq(bookingsTable.contractId, contractId));

  const rows = await db
    .select({
      driverId: driversTable.id,
      driverName: driversTable.fullName,
      phone: driversTable.phone,
      shiftDate: bookingsTable.shiftDate,
      status: bookingsTable.status,
      startTime: bookingsTable.startTime,
      companyName: contractsTable.companyName,
      location: contractsTable.location,
    })
    .from(bookingsTable)
    .innerJoin(driversTable, eq(driversTable.id, bookingsTable.driverId))
    .innerJoin(contractsTable, eq(contractsTable.id, bookingsTable.contractId))
    .where(and(...conditions))
    .orderBy(asc(driversTable.fullName), asc(bookingsTable.shiftDate));

  const byDriver = new Map<
    number,
    {
      driverId: number;
      driverName: string;
      phone: string | null;
      shifts: {
        shiftDate: string;
        status: string;
        startTime: string | null;
        companyName: string | null;
        location: string | null;
      }[];
    }
  >();

  for (const r of rows) {
    if (!WORKING_STATUSES.has(r.status)) continue;
    let entry = byDriver.get(r.driverId);
    if (!entry) {
      entry = {
        driverId: r.driverId,
        driverName: r.driverName,
        phone: r.phone,
        shifts: [],
      };
      byDriver.set(r.driverId, entry);
    }
    entry.shifts.push({
      shiftDate: r.shiftDate,
      status: r.status,
      startTime: shortTime(r.startTime),
      companyName: r.companyName,
      location: r.location,
    });
  }

  const previews = Array.from(byDriver.values()).map((d) => {
    const lines = d.shifts.map((s) => {
      const time = s.startTime ? ` start ${s.startTime}` : "";
      const where = s.companyName ? ` @ ${s.companyName}` : "";
      const loc = s.location ? ` (${s.location})` : "";
      return `• ${s.shiftDate}${where}${loc} — ${s.status}${time}`;
    });
    const messageText = [
      `Hi ${d.driverName}, please confirm the following shifts:`,
      "",
      lines.join("\n"),
      "",
      "Reply YES to confirm. Thank you.",
    ].join("\n");
    return {
      driverId: d.driverId,
      driverName: d.driverName,
      phone: d.phone,
      messageText,
      shifts: d.shifts,
    };
  });

  res.json(previews);
});

export default router;
