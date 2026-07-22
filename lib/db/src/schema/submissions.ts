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
    // Nullable: a submission is EITHER for an existing worker (workerId set) OR a
    // brand-new candidate not yet in the worker list (candidateName set). A
    // candidate submission never creates a bookable worker.
    workerId: integer("worker_id").references(() => workersTable.id, {
      onDelete: "cascade",
    }),
    candidateName: text("candidate_name"),
    candidatePhone: text("candidate_phone"),
    // The job role and sheet the person is being submitted for. Captured on the
    // submission so that, when the outcome becomes "passed", a candidate can be
    // auto-created as a worker with this role on this sheet. Nullable only for
    // legacy rows recorded before these fields existed.
    jobRole: text("job_role"),
    customJobTitle: text("custom_job_title"),
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
    // Exactly one identity source: an existing worker OR a standalone candidate
    // name. Never both, never neither.
    check(
      "submissions_identity",
      sql`(${t.workerId} IS NOT NULL AND ${t.candidateName} IS NULL) OR (${t.workerId} IS NULL AND ${t.candidateName} IS NOT NULL)`,
    ),
  ],
);

export type Submission = typeof submissionsTable.$inferSelect;
