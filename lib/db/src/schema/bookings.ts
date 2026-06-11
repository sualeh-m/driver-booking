import {
  pgTable,
  serial,
  integer,
  date,
  text,
  time,
  timestamp,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";
import { sheetsTable } from "./sheets";
import { usersTable } from "./users";

export const BOOKING_STATUSES = [
  "Available",
  "Pre-Booked",
  "Rest",
  "Off",
  "Holiday",
  "Confirmed",
] as const;

export const bookingsTable = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id")
      .notNull()
      .references(() => workersTable.id, { onDelete: "cascade" }),
    sheetId: integer("sheet_id")
      .notNull()
      .references(() => sheetsTable.id, { onDelete: "restrict" }),
    shiftDate: date("shift_date", { mode: "string" }).notNull(),
    status: text("status").notNull().default("Available"),
    startTime: time("start_time"),
    createdBy: integer("created_by").references(() => usersTable.id),
    updatedBy: integer("updated_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("one_booking_per_worker_per_day").on(t.workerId, t.shiftDate),
    check(
      "bookings_status",
      sql`${t.status} IN ('Available','Pre-Booked','Rest','Off','Holiday','Confirmed')`,
    ),
    index("idx_bookings_date").on(t.shiftDate),
    index("idx_bookings_sheet").on(t.sheetId),
    index("idx_bookings_worker").on(t.workerId, t.shiftDate),
  ],
);

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
