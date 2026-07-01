import { Router, type IRouter } from "express";
import { and, count, eq } from "drizzle-orm";
import {
  db,
  sheetsTable,
  sheetContactsTable,
  workersTable,
  workerSheetsTable,
  bookingsTable,
  shiftRequirementsTable,
  submissionsTable,
} from "@workspace/db";
import {
  CreateSheetBody,
  DeleteSheetParams,
  GetSheetDeleteImpactParams,
  AddSheetContactParams,
  AddSheetContactBody,
  UpdateSheetContactParams,
  UpdateSheetContactBody,
  RemoveSheetContactParams,
  AddWorkerToSheetParams,
  AddWorkerToSheetBody,
  RemoveWorkerFromSheetParams,
} from "@workspace/api-zod";
import { serializeSheet, serializeSheetContact, sheetDisplayName } from "../lib/serialize";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/sheets", async (_req, res): Promise<void> => {
  const sheets = await db
    .select()
    .from(sheetsTable)
    .orderBy(sheetsTable.clientCompany, sheetsTable.depot);
  res.json(sheets.map(serializeSheet));
});

router.post("/sheets", async (req, res): Promise<void> => {
  const parsed = CreateSheetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [sheet] = await db
    .insert(sheetsTable)
    .values({
      name: sheetDisplayName(parsed.data.clientCompany, parsed.data.depot),
      clientCompany: parsed.data.clientCompany,
      depot: parsed.data.depot ?? null,
      workerType: parsed.data.workerType,
    })
    .returning();

  res.status(201).json(serializeSheet(sheet));
});

// Admin only. Delete a whole sheet plus all of its bookings. bookings.sheet_id
// is ON DELETE RESTRICT, so bookings must be removed manually inside the txn
// before the sheet; everything else (contacts, workerSheets, shiftRequirements)
// cascades, and submissions/events/auditLog references are set null by the DB.
// requireAdmin is attached per-route so the admin gate does not leak onto other
// routes in this router.
router.delete(
  "/sheets/:sheetId",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteSheetParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const deleted = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: sheetsTable.id })
        .from(sheetsTable)
        .where(eq(sheetsTable.id, params.data.sheetId));
      if (!existing) return false;

      await tx
        .delete(bookingsTable)
        .where(eq(bookingsTable.sheetId, params.data.sheetId));
      await tx.delete(sheetsTable).where(eq(sheetsTable.id, params.data.sheetId));
      return true;
    });

    if (!deleted) {
      res.status(404).json({ error: "Sheet not found" });
      return;
    }

    res.status(204).end();
  },
);

// Admin only. Report how many related records deleting this sheet would also
// remove (bookings are hand-deleted, contacts/worker-links/requirements cascade;
// submissions have their sheet_id set null but are counted so the impact is
// clear), so the confirmation dialog can state the real impact. requireAdmin is
// attached per-route so the admin gate does not leak onto other routes here.
router.get(
  "/sheets/:sheetId/delete-impact",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = GetSheetDeleteImpactParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const sheetId = params.data.sheetId;

    const [existing] = await db
      .select({ id: sheetsTable.id })
      .from(sheetsTable)
      .where(eq(sheetsTable.id, sheetId));
    if (!existing) {
      res.status(404).json({ error: "Sheet not found" });
      return;
    }

    const [[bookings], [workers], [contacts], [requirements], [submissions]] =
      await Promise.all([
        db.select({ n: count() }).from(bookingsTable).where(eq(bookingsTable.sheetId, sheetId)),
        db.select({ n: count() }).from(workerSheetsTable).where(eq(workerSheetsTable.sheetId, sheetId)),
        db.select({ n: count() }).from(sheetContactsTable).where(eq(sheetContactsTable.sheetId, sheetId)),
        db.select({ n: count() }).from(shiftRequirementsTable).where(eq(shiftRequirementsTable.sheetId, sheetId)),
        db.select({ n: count() }).from(submissionsTable).where(eq(submissionsTable.sheetId, sheetId)),
      ]);

    res.json({
      bookings: bookings.n,
      workers: workers.n,
      contacts: contacts.n,
      requirements: requirements.n,
      submissions: submissions.n,
    });
  },
);

router.get(
  "/sheets/:sheetId/contacts",
  async (req, res): Promise<void> => {
    const params = AddSheetContactParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const contacts = await db
      .select()
      .from(sheetContactsTable)
      .where(eq(sheetContactsTable.sheetId, params.data.sheetId))
      .orderBy(sheetContactsTable.id);
    res.json(contacts.map(serializeSheetContact));
  },
);

router.post(
  "/sheets/:sheetId/contacts",
  async (req, res): Promise<void> => {
    const params = AddSheetContactParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = AddSheetContactBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [sheet] = await db
      .select()
      .from(sheetsTable)
      .where(eq(sheetsTable.id, params.data.sheetId));
    if (!sheet) {
      res.status(400).json({ error: "Unknown sheet" });
      return;
    }

    const contact = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(sheetContactsTable)
        .where(eq(sheetContactsTable.sheetId, params.data.sheetId));

      // First contact added is primary by default; or honour an explicit flag.
      const makePrimary = body.data.isPrimary === true || existing.length === 0;

      if (makePrimary) {
        await tx
          .update(sheetContactsTable)
          .set({ isPrimary: false })
          .where(eq(sheetContactsTable.sheetId, params.data.sheetId));
      }

      const [created] = await tx
        .insert(sheetContactsTable)
        .values({
          sheetId: params.data.sheetId,
          contactName: body.data.contactName ?? null,
          email: body.data.email,
          isPrimary: makePrimary,
        })
        .returning();
      return created;
    });

    res.status(201).json(serializeSheetContact(contact));
  },
);

router.patch(
  "/sheets/:sheetId/contacts/:contactId",
  async (req, res): Promise<void> => {
    const params = UpdateSheetContactParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateSheetContactBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(sheetContactsTable)
        .where(
          and(
            eq(sheetContactsTable.id, params.data.contactId),
            eq(sheetContactsTable.sheetId, params.data.sheetId),
          ),
        );
      if (!target) return null;

      if (body.data.isPrimary) {
        await tx
          .update(sheetContactsTable)
          .set({ isPrimary: false })
          .where(eq(sheetContactsTable.sheetId, params.data.sheetId));
      }

      const [row] = await tx
        .update(sheetContactsTable)
        .set({ isPrimary: body.data.isPrimary })
        .where(eq(sheetContactsTable.id, params.data.contactId))
        .returning();
      return row;
    });

    if (!updated) {
      res.status(400).json({ error: "Unknown contact" });
      return;
    }

    res.json(serializeSheetContact(updated));
  },
);

router.delete(
  "/sheets/:sheetId/contacts/:contactId",
  async (req, res): Promise<void> => {
    const params = RemoveSheetContactParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    await db
      .delete(sheetContactsTable)
      .where(
        and(
          eq(sheetContactsTable.id, params.data.contactId),
          eq(sheetContactsTable.sheetId, params.data.sheetId),
        ),
      );

    res.sendStatus(204);
  },
);

router.post(
  "/sheets/:sheetId/workers",
  async (req, res): Promise<void> => {
    const params = AddWorkerToSheetParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = AddWorkerToSheetBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [sheet] = await db
      .select()
      .from(sheetsTable)
      .where(eq(sheetsTable.id, params.data.sheetId));
    if (!sheet) {
      res.status(400).json({ error: "Unknown sheet" });
      return;
    }

    const [worker] = await db
      .select()
      .from(workersTable)
      .where(eq(workersTable.id, body.data.workerId));
    if (!worker) {
      res.status(400).json({ error: "Unknown worker" });
      return;
    }

    await db
      .insert(workerSheetsTable)
      .values({
        sheetId: params.data.sheetId,
        workerId: body.data.workerId,
        notes: body.data.notes ?? null,
      })
      .onConflictDoUpdate({
        target: [workerSheetsTable.workerId, workerSheetsTable.sheetId],
        set: { notes: body.data.notes ?? null },
      });

    res.sendStatus(204);
  },
);

router.delete(
  "/sheets/:sheetId/workers/:workerId",
  async (req, res): Promise<void> => {
    const params = RemoveWorkerFromSheetParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    await db
      .delete(workerSheetsTable)
      .where(
        and(
          eq(workerSheetsTable.sheetId, params.data.sheetId),
          eq(workerSheetsTable.workerId, params.data.workerId),
        ),
      );

    res.sendStatus(204);
  },
);

export default router;
