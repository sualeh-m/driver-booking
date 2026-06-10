import {
  pgTable,
  serial,
  integer,
  date,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";
import { usersTable } from "./users";

export const messagesTable = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    driverId: integer("driver_id")
      .notNull()
      .references(() => driversTable.id, { onDelete: "cascade" }),
    shiftDate: date("shift_date", { mode: "string" }),
    direction: text("direction").notNull(),
    channel: text("channel").notNull().default("sms"),
    body: text("body"),
    status: text("status"),
    sentBy: integer("sent_by").references(() => usersTable.id),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    responseText: text("response_text"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [index("idx_messages_driver").on(t.driverId)],
);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  sentAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
