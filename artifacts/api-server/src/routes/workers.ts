import { Router, type IRouter } from "express";
import { and, count, eq, or, ilike, sql } from "drizzle-orm";
import {
  db,
  workersTable,
  eventsTable,
  workerSheetsTable,
  bookingsTable,
  submissionsTable,
  leaversTable,
  messagesTable,
} from "@workspace/db";
import { workerTypeForJobRole } from "../lib/workerType";
import {
  CreateWorkerBody,
  ListWorkersQueryParams,
  SetWorkerDoNotBookParams,
  SetWorkerDoNotBookBody,
  GetWorkerParams,
  UpdateWorkerParams,
  UpdateWorkerBody,
  GetWorkerDeleteImpactParams,
  DeleteWorkerParams,
} from "@workspace/api-zod";
import { serializeWorker } from "../lib/serialize";
import { requireAdmin } from "../lib/auth";
import { formatName, strictUkMobile, UK_MOBILE_ERROR } from "../lib/format";
import { resolveCustomJobTitle, rememberJobTitle } from "../lib/jobTitles";

// Normalise an optional free-text field: trim, and treat empty as null so we
// never store blank strings.
function cleanText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

const router: IRouter = Router();

router.get("/workers", async (req, res): Promise<void> => {
  const query = ListWorkersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const search = query.data.search?.trim();
  const rows = search
    ? await db
        .select()
        .from(workersTable)
        .where(
          or(
            ilike(workersTable.fullName, `%${search}%`),
            ilike(workersTable.phone, `%${search}%`),
            ilike(workersTable.jobRole, `%${search}%`),
          ),
        )
        .orderBy(workersTable.fullName)
    : await db.select().from(workersTable).orderBy(workersTable.fullName);

  res.json(rows.map(serializeWorker));
});

// Workers flagged Do Not Book, each with their total no-show count so the
// manager can see why they were flagged. Declared before any "/workers/:id"
// param routes so the literal path wins.
router.get("/workers/do-not-book", async (_req, res): Promise<void> => {
  const noShowCount = db
    .select({
      workerId: eventsTable.workerId,
      value: count().as("no_show_count"),
    })
    .from(eventsTable)
    .where(eq(eventsTable.eventType, "no_show"))
    .groupBy(eventsTable.workerId)
    .as("no_show_count");

  const rows = await db
    .select({
      id: workersTable.id,
      fullName: workersTable.fullName,
      phone: workersTable.phone,
      jobRole: workersTable.jobRole,
      workerType: workersTable.workerType,
      doNotBook: workersTable.doNotBook,
      noShowCount: sql<number>`coalesce(${noShowCount.value}, 0)::int`,
    })
    .from(workersTable)
    .leftJoin(noShowCount, eq(noShowCount.workerId, workersTable.id))
    .where(eq(workersTable.doNotBook, true))
    .orderBy(workersTable.fullName);

  res.json(rows);
});

router.patch("/workers/:id/do-not-book", async (req, res): Promise<void> => {
  const params = SetWorkerDoNotBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SetWorkerDoNotBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [worker] = await db
    .update(workersTable)
    .set({ doNotBook: parsed.data.doNotBook })
    .where(eq(workersTable.id, params.data.id))
    .returning();

  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  res.json(serializeWorker(worker));
});

// Single worker by id. Registered after the literal "/workers/do-not-book"
// route so that path is not captured by ":id".
router.get("/workers/:id", async (req, res): Promise<void> => {
  const params = GetWorkerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [worker] = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.id, params.data.id));

  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  res.json(serializeWorker(worker));
});

// Update a worker's editable details. start_date is auto-derived from the
// worker's first booking and is deliberately NOT accepted here. Changing
// worker_type needs no extra reconciliation: the HGV rest-day rule and the
// HGV-only event check both read workers.worker_type live, so they follow the
// new value automatically. When a sheetId is supplied the standing note for
// that worker+sheet is updated in the same transaction.
router.patch("/workers/:id", async (req, res): Promise<void> => {
  const params = UpdateWorkerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateWorkerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fullName, phone, jobRole, note, sheetId } = parsed.data;

  // Worker mobile numbers are mandatory and must be a valid UK mobile.
  const formattedPhone = strictUkMobile(phone);
  if (formattedPhone === null) {
    res.status(400).json({ error: UK_MOBILE_ERROR });
    return;
  }

  const cleanedJobRole = cleanText(jobRole);

  // "Other" requires a custom title; any other role forces it null so a role
  // change away from Other never leaves a stale title behind.
  const title = resolveCustomJobTitle(cleanedJobRole, parsed.data.customJobTitle);
  if (!title.ok) {
    res.status(400).json({ error: title.error });
    return;
  }

  try {
    const worker = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(workersTable)
        .set({
          fullName: formatName(fullName),
          phone: formattedPhone,
          jobRole: cleanedJobRole,
          customJobTitle: title.value,
          workerType: workerTypeForJobRole(cleanedJobRole),
        })
        .where(eq(workersTable.id, params.data.id))
        .returning();

      if (!updated) return null;

      // Save the typed title into the suggestion list (case-insensitive dedupe).
      await rememberJobTitle(tx, title.value);

      // Standing notes live per worker+sheet. Only touch the link the editor
      // is looking at; if the worker isn't linked to that sheet this is a no-op.
      if (sheetId !== undefined) {
        await tx
          .update(workerSheetsTable)
          .set({ notes: cleanText(note) })
          .where(
            and(
              eq(workerSheetsTable.workerId, params.data.id),
              eq(workerSheetsTable.sheetId, sheetId),
            ),
          );
      }

      return updated;
    });

    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    res.json(serializeWorker(worker));
  } catch {
    res.status(500).json({ error: "Failed to update worker" });
  }
});

// Admin only. Report how many related records deleting this worker would also
// remove, so the confirmation dialog can state the real impact. Every listed
// table FK-cascades on worker delete, so these counts are exactly what is purged.
// requireAdmin is attached per-route so the admin gate does not leak onto the
// other routes in this router.
router.get(
  "/workers/:id/delete-impact",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = GetWorkerDeleteImpactParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const id = params.data.id;

    const [worker] = await db
      .select({ id: workersTable.id })
      .from(workersTable)
      .where(eq(workersTable.id, id));
    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    const [[bookings], [submissions], [events], [workerSheets], [messages], [leavers]] =
      await Promise.all([
        db.select({ n: count() }).from(bookingsTable).where(eq(bookingsTable.workerId, id)),
        db.select({ n: count() }).from(submissionsTable).where(eq(submissionsTable.workerId, id)),
        db.select({ n: count() }).from(eventsTable).where(eq(eventsTable.workerId, id)),
        db.select({ n: count() }).from(workerSheetsTable).where(eq(workerSheetsTable.workerId, id)),
        db.select({ n: count() }).from(messagesTable).where(eq(messagesTable.workerId, id)),
        db.select({ n: count() }).from(leaversTable).where(eq(leaversTable.workerId, id)),
      ]);

    res.json({
      bookings: bookings.n,
      submissions: submissions.n,
      events: events.n,
      workerSheets: workerSheets.n,
      messages: messages.n,
      hasLeaverRecord: leavers.n > 0,
    });
  },
);

// Admin only. Permanently delete a worker and everything referencing them
// (bookings, submissions, events, worker-sheet links, messages, leaver records
// all FK-cascade; audit_log.booking_id is set null). This is DISTINCT from
// "mark as leaver": the worker and their history are erased entirely, so they no
// longer appear in any KPI report. requireAdmin is attached per-route.
router.delete(
  "/workers/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteWorkerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const deleted = await db
      .delete(workersTable)
      .where(eq(workersTable.id, params.data.id))
      .returning({ id: workersTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    res.status(204).end();
  },
);

router.post("/workers", async (req, res): Promise<void> => {
  const parsed = CreateWorkerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Worker mobile numbers are mandatory and must be a valid UK mobile.
  const formattedPhone = strictUkMobile(parsed.data.phone);
  if (formattedPhone === null) {
    res.status(400).json({ error: UK_MOBILE_ERROR });
    return;
  }

  const jobRole = parsed.data.jobRole ?? null;

  // "Other" requires a custom title; any other role forces it null.
  const title = resolveCustomJobTitle(jobRole, parsed.data.customJobTitle);
  if (!title.ok) {
    res.status(400).json({ error: title.error });
    return;
  }

  const worker = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(workersTable)
      .values({
        fullName: formatName(parsed.data.fullName),
        phone: formattedPhone,
        jobRole,
        customJobTitle: title.value,
        workerType: workerTypeForJobRole(jobRole),
        startDate: parsed.data.startDate ?? null,
        vincereId: parsed.data.vincereId ?? null,
      })
      .returning();

    // Save the typed title into the suggestion list (case-insensitive dedupe).
    await rememberJobTitle(tx, title.value);

    return created;
  });

  res.status(201).json(serializeWorker(worker));
});

export default router;
