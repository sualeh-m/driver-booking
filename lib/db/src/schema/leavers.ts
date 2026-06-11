import {
  pgTable,
  serial,
  integer,
  date,
  text,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workersTable } from "./workers";
import { usersTable } from "./users";

export const leaversTable = pgTable(
  "leavers",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id")
      .notNull()
      .references(() => workersTable.id, { onDelete: "cascade" }),
    leaveDate: date("leave_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "leavers_reason",
      sql`${t.reason} IN ('low_rates','travel_distance','permanent_employment','shift_pattern','performance_issues','attendance_issues','other')`,
    ),
  ],
);

export type Leaver = typeof leaversTable.$inferSelect;
