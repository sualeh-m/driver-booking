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
import { workersTable } from "./workers";
import { sheetsTable } from "./sheets";
import { usersTable } from "./users";

export const eventsTable = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id")
      .notNull()
      .references(() => workersTable.id, { onDelete: "cascade" }),
    sheetId: integer("sheet_id").references(() => sheetsTable.id, {
      onDelete: "set null",
    }),
    eventDate: date("event_date", { mode: "string" }).notNull(),
    eventType: text("event_type").notNull(),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_events_date").on(t.eventDate),
    index("idx_events_type").on(t.eventType),
    check(
      "events_event_type",
      sql`${t.eventType} IN ('no_show','cpc_failure','test_failure')`,
    ),
  ],
);

export type Event = typeof eventsTable.$inferSelect;
