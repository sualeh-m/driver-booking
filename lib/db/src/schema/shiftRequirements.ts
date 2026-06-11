import {
  pgTable,
  serial,
  integer,
  date,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sheetsTable } from "./sheets";
import { usersTable } from "./users";

export const shiftRequirementsTable = pgTable(
  "shift_requirements",
  {
    id: serial("id").primaryKey(),
    sheetId: integer("sheet_id")
      .notNull()
      .references(() => sheetsTable.id, { onDelete: "cascade" }),
    reqDate: date("req_date", { mode: "string" }).notNull(),
    jobRole: text("job_role"),
    quantityNeeded: integer("quantity_needed").notNull().default(1),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_requirements_sheet_date").on(t.sheetId, t.reqDate)],
);

export type ShiftRequirement = typeof shiftRequirementsTable.$inferSelect;
