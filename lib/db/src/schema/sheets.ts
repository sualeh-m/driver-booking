import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const WORKER_TYPES = ["HGV", "Warehouse"] as const;

// Sheets carry NO worker type — any worker of any job role can be added to any
// sheet. Workers themselves stay HGV/Warehouse (derived from job role) — see
// workers.ts; the rest-day rule keys off the worker's job role alone.
export const sheetsTable = pgTable("sheets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  clientCompany: text("client_company").notNull(),
  depot: text("depot"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSheetSchema = createInsertSchema(sheetsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSheet = z.infer<typeof insertSheetSchema>;
export type Sheet = typeof sheetsTable.$inferSelect;
