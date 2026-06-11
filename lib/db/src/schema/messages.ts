import {
  pgTable,
  serial,
  integer,
  date,
  text,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";
import { usersTable } from "./users";

export const messagesTable = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id")
      .notNull()
      .references(() => workersTable.id, { onDelete: "cascade" }),
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
  (t) => [
    index("idx_messages_worker").on(t.workerId),
    check("messages_direction", sql`${t.direction} IN ('outbound','inbound')`),
    check("messages_channel", sql`${t.channel} IN ('sms','email')`),
  ],
);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  sentAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
