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
import { shiftRequirementsTable } from "./shiftRequirements";
import { usersTable } from "./users";

export const submissionsTable = pgTable(
  "submissions",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id")
      .notNull()
      .references(() => workersTable.id, { onDelete: "cascade" }),
    requirementId: integer("requirement_id").references(
      () => shiftRequirementsTable.id,
      { onDelete: "set null" },
    ),
    sheetId: integer("sheet_id").references(() => sheetsTable.id, {
      onDelete: "set null",
    }),
    submittedDate: date("submitted_date", { mode: "string" }).notNull(),
    outcome: text("outcome").notNull().default("submitted"),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_submissions_date").on(t.submittedDate),
    check(
      "submissions_outcome",
      sql`${t.outcome} IN ('submitted','passed','rejected')`,
    ),
  ],
);

export type Submission = typeof submissionsTable.$inferSelect;
