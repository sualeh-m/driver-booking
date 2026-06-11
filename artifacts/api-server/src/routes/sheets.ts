import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  sheetsTable,
  sheetContactsTable,
  workersTable,
  workerSheetsTable,
} from "@workspace/db";
import {
  CreateSheetBody,
  AddSheetContactParams,
  AddSheetContactBody,
  UpdateSheetContactParams,
  UpdateSheetContactBody,
  RemoveSheetContactParams,
  AddWorkerToSheetParams,
  AddWorkerToSheetBody,
  RemoveWorkerFromSheetParams,
} from "@workspace/api-zod";
import { serializeSheet, serializeSheetContact } from "../lib/serialize";

const router: IRouter = Router();

router.get("/sheets", async (_req, res): Promise<void> => {
  const sheets = await db
    .select()
    .from(sheetsTable)
    .orderBy(sheetsTable.clientCompany, sheetsTable.name);
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
      name: parsed.data.name,
      clientCompany: parsed.data.clientCompany,
      depot: parsed.data.depot ?? null,
      workerType: parsed.data.workerType,
    })
    .returning();

  res.status(201).json(serializeSheet(sheet));
});

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
