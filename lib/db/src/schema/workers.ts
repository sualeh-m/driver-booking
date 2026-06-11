import { pgTable, serial, text, date, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const WORKER_STATUSES = ["active", "left"] as const;

export const workersTable = pgTable(
  "workers",
  {
    id: serial("id").primaryKey(),
    vincereId: text("vincere_id").unique(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    jobRole: text("job_role"),
    workerType: text("worker_type").notNull(),
    startDate: date("start_date", { mode: "string" }),
    status: text("status").notNull().default("active"),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("workers_worker_type", sql`${t.workerType} IN ('HGV','Warehouse')`),
    check("workers_status", sql`${t.status} IN ('active','left')`),
  ],
);

export const insertWorkerSchema = createInsertSchema(workersTable).omit({
  id: true,
  syncedAt: true,
});
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workersTable.$inferSelect;
