import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  vincereId: text("vincere_id").unique(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  jobRole: text("job_role"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  syncedAt: timestamp("synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertDriverSchema = createInsertSchema(driversTable).omit({
  id: true,
  syncedAt: true,
});
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
