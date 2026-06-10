import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";
import { usersTable } from "./users";

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id").references(() => bookingsTable.id, {
      onDelete: "set null",
    }),
    userId: integer("user_id").references(() => usersTable.id),
    action: text("action").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_audit_booking").on(t.bookingId)],
);

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({
  id: true,
  changedAt: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
