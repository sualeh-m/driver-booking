import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";
import { contractsTable } from "./contracts";

export const driverContractsTable = pgTable(
  "driver_contracts",
  {
    driverId: integer("driver_id")
      .notNull()
      .references(() => driversTable.id, { onDelete: "cascade" }),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contractsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.driverId, t.contractId] })],
);

export const insertDriverContractSchema =
  createInsertSchema(driverContractsTable);
export type InsertDriverContract = z.infer<typeof insertDriverContractSchema>;
export type DriverContract = typeof driverContractsTable.$inferSelect;
