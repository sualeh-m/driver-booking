import { pgTable, serial, integer, text, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sheetsTable } from "./sheets";

export const sheetContactsTable = pgTable(
  "sheet_contacts",
  {
    id: serial("id").primaryKey(),
    sheetId: integer("sheet_id")
      .notNull()
      .references(() => sheetsTable.id, { onDelete: "cascade" }),
    contactName: text("contact_name"),
    email: text("email").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [index("idx_sheet_contacts_sheet").on(t.sheetId)],
);

export const insertSheetContactSchema = createInsertSchema(
  sheetContactsTable,
).omit({ id: true });
export type InsertSheetContact = z.infer<typeof insertSheetContactSchema>;
export type SheetContact = typeof sheetContactsTable.$inferSelect;
