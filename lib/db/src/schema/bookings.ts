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
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";
import { contractsTable } from "./contracts";
import { usersTable } from "./users";

export const BOOKING_STATUSES = [
  "Available",
  "Pre-Booked",
  "Confirmed",
  "Rest",
  "Off",
  "Holiday",
] as const;

export const bookingsTable = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    driverId: integer("driver_id")
      .notNull()
      .references(() => driversTable.id, { onDelete: "cascade" }),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contractsTable.id, { onDelete: "restrict" }),
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
    unique("one_booking_per_driver_per_day").on(t.driverId, t.shiftDate),
    index("idx_bookings_date").on(t.shiftDate),
    index("idx_bookings_contract").on(t.contractId),
  ],
);

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
