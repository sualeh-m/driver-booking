import { pgTable, serial, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const WORKER_TYPES = ["HGV", "Warehouse"] as const;
// Sheets can additionally be "Both" (run HGV and warehouse work on one sheet).
// Workers themselves stay HGV/Warehouse — see workers.ts.
export const SHEET_WORKER_TYPES = ["HGV", "Warehouse", "Both"] as const;

export const sheetsTable = pgTable(
  "sheets",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    clientCompany: text("client_company").notNull(),
    depot: text("depot"),
    workerType: text("worker_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("sheets_worker_type", sql`${t.workerType} IN ('HGV','Warehouse','Both')`),
  ],
);

export const insertSheetSchema = createInsertSchema(sheetsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSheet = z.infer<typeof insertSheetSchema>;
export type Sheet = typeof sheetsTable.$inferSelect;
