import { pgTable, integer, text, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";
import { sheetsTable } from "./sheets";

export const workerSheetsTable = pgTable(
  "worker_sheets",
  {
    workerId: integer("worker_id")
      .notNull()
      .references(() => workersTable.id, { onDelete: "cascade" }),
    sheetId: integer("sheet_id")
      .notNull()
      .references(() => sheetsTable.id, { onDelete: "cascade" }),
    notes: text("notes"),
  },
  (t) => [primaryKey({ columns: [t.workerId, t.sheetId] })],
);

export const insertWorkerSheetSchema = createInsertSchema(workerSheetsTable);
export type InsertWorkerSheet = z.infer<typeof insertWorkerSheetSchema>;
export type WorkerSheet = typeof workerSheetsTable.$inferSelect;
