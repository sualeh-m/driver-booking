import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  contractsTable,
  driversTable,
  driverContractsTable,
} from "@workspace/db";
import {
  CreateContractBody,
  AddDriverToContractBody,
  AddDriverToContractParams,
  RemoveDriverFromContractParams,
} from "@workspace/api-zod";
import { serializeContract } from "../lib/serialize";

const router: IRouter = Router();

router.get("/contracts", async (_req, res): Promise<void> => {
  const contracts = await db
    .select()
    .from(contractsTable)
    .orderBy(contractsTable.companyName);
  res.json(contracts.map(serializeContract));
});

router.post("/contracts", async (req, res): Promise<void> => {
  const parsed = CreateContractBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [contract] = await db
    .insert(contractsTable)
    .values({
      companyName: parsed.data.companyName,
      clientContactName: parsed.data.clientContactName ?? null,
      clientContactEmail: parsed.data.clientContactEmail ?? null,
      location: parsed.data.location ?? null,
    })
    .returning();

  res.status(201).json(serializeContract(contract));
});

router.post(
  "/contracts/:contractId/drivers",
  async (req, res): Promise<void> => {
    const params = AddDriverToContractParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = AddDriverToContractBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [contract] = await db
      .select()
      .from(contractsTable)
      .where(eq(contractsTable.id, params.data.contractId));
    if (!contract) {
      res.status(400).json({ error: "Unknown contract" });
      return;
    }

    const [driver] = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.id, body.data.driverId));
    if (!driver) {
      res.status(400).json({ error: "Unknown driver" });
      return;
    }

    await db
      .insert(driverContractsTable)
      .values({
        contractId: params.data.contractId,
        driverId: body.data.driverId,
      })
      .onConflictDoNothing();

    res.sendStatus(204);
  },
);

router.delete(
  "/contracts/:contractId/drivers/:driverId",
  async (req, res): Promise<void> => {
    const params = RemoveDriverFromContractParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    await db
      .delete(driverContractsTable)
      .where(
        and(
          eq(driverContractsTable.contractId, params.data.contractId),
          eq(driverContractsTable.driverId, params.data.driverId),
        ),
      );

    res.sendStatus(204);
  },
);

export default router;
